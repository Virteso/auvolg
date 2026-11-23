#!/bin/sh
# Generate HAProxy fragments that cannot be expressed statically:
# - bufsize.cfg: tune.bufsize sized to the largest served file
# - static_backend.cfg: per-file routes, 304/ETag/headers, gzip, 404
#
# HAProxy loads `file` payloads at config parse time and has no directory/static
# file serving, so the route list must be generated from the files on disk.
set -eu

STATIC_DIR="${STATIC_DIR:-/staticfiles}"
SITE_DIR="${SITE_DIR:-/usr/share/site/src}"
ASSETS_DIR="${ASSETS_DIR:-/usr/share/site/assets}"
FAVICON="${FAVICON:-/usr/local/etc/haproxy/files/favicon.ico}"

GEN_DIR="${GEN_DIR:-/run/haproxy/generated}"
COMPRESSED_DIR="$GEN_DIR/compressed"
BACKEND_FILE="$GEN_DIR/static_backend.cfg"
BUF_FILE="$GEN_DIR/bufsize.cfg"
mkdir -p "$GEN_DIR" "$COMPRESSED_DIR"

CSP="default-src 'none'; base-uri 'none'; form-action 'self'; script-src 'self'; connect-src 'self'; style-src 'self'; img-src 'self' data:"
PERMISSIONS_POLICY="accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), fullscreen=(self)"

# ---------------------------------------------------------------------------
# Helpers for rendering one static-file route
# ---------------------------------------------------------------------------

content_type() {
	case "$1" in
		*.html|*.htm)   printf '%s' 'text/html; charset=utf-8' ;;
		*.css)          printf '%s' 'text/css; charset=utf-8' ;;
		*.js|*.mjs)     printf '%s' 'application/javascript; charset=utf-8' ;;
		*.json|*.map)   printf '%s' 'application/json; charset=utf-8' ;;
		*.svg)          printf '%s' 'image/svg+xml' ;;
		*.png)          printf '%s' 'image/png' ;;
		*.jpg|*.jpeg)   printf '%s' 'image/jpeg' ;;
		*.gif)          printf '%s' 'image/gif' ;;
		*.webp)         printf '%s' 'image/webp' ;;
		*.ico)          printf '%s' 'image/x-icon' ;;
		*.woff2)        printf '%s' 'font/woff2' ;;
		*.woff)         printf '%s' 'font/woff' ;;
		*.ttf)          printf '%s' 'font/ttf' ;;
		*.txt)          printf '%s' 'text/plain; charset=utf-8' ;;
		*.xml)          printf '%s' 'application/xml; charset=utf-8' ;;
		*)              printf '%s' 'application/octet-stream' ;;
	esac
}

is_compressible() {
	case "$1" in
		*.html|*.htm|*.css|*.js|*.mjs|*.json|*.svg|*.xml|*.txt|*.map) return 0 ;;
		*) return 1 ;;
	esac
}

cache_control_for() {
	case "$1" in
		/favicon.ico)          printf '%s' 'public, max-age=86400, immutable' ;;
		/assets/*)             printf '%s' 'public, max-age=86400' ;;
		/static/*|/script.js)  printf '%s' 'public, max-age=0, must-revalidate' ;;
		*)                     printf '%s' '' ;;
	esac
}

# HAProxy loads `file` payloads when it parses the config, so compressed
# variants are written next to the generated config, not into the site dirs.
add_file() {
	url="$1"
	file="$2"

	[ -f "$file" ] || return 0
	case "$(basename "$file")" in
		.*) return 0 ;;
	esac

	size=$(stat -c %s "$file")
	# HAProxy warns when a file payload is empty; skip empty placeholders.
	[ "$size" -gt 0 ] || return 0
	mtime=$(stat -c %Y "$file")
	etag=$(printf '%x-%x' "$size" "$mtime")
	lastmod=$(date -u -R -d "@$mtime")
	ct=$(content_type "$file")
	cc=$(cache_control_for "$url")

	base_hdrs=""
	[ -n "$cc" ] && base_hdrs="$base_hdrs $(printf 'hdr Cache-Control "%s"' "$cc")"
	case "$ct" in
		text/html*)
			base_hdrs="$base_hdrs $(printf 'hdr Content-Security-Policy "%s"' "$CSP")"
			base_hdrs="$base_hdrs $(printf 'hdr Permissions-Policy "%s"' "$PERMISSIONS_POLICY")"
			;;
	esac
	base_hdrs="$base_hdrs $(printf 'hdr Last-Modified "%s"' "$lastmod")"
	etag_hdr=$(printf 'hdr ETag "\\"%s\\""' "$etag")
	gz_etag_hdr=$(printf 'hdr ETag "\\"%s-gzip\\""' "$etag")

	# Conditional requests (nginx served these automatically for static files).
	printf '    http-request return status 304 %s if { path %s } { req.hdr(If-None-Match) -m sub "%s" }\n' \
		"$etag_hdr" "$url" "$etag" >>"$BACKEND_FILE"
	printf '    http-request return status 304 %s if { path %s } { req.hdr(If-None-Match) -m sub "%s-gzip" }\n' \
		"$gz_etag_hdr" "$url" "$etag" >>"$BACKEND_FILE"
	printf '    http-request return status 304 if { path %s } { req.hdr(If-Modified-Since) -m str "%s" }\n' \
		"$url" "$lastmod" >>"$BACKEND_FILE"

	# Prefer an existing .gz sidecar from js/gzip.js, otherwise compress on the
	# fly once at config-generation time (equivalent to nginx's gzip on).
	gz_src=""
	if [ -f "$file.gz" ]; then
		gz_src="$file.gz"
	elif is_compressible "$file" && [ "$size" -ge 256 ]; then
		slug=$(printf '%s' "$url" | tr -c 'A-Za-z0-9' '_')
		gz_src="$COMPRESSED_DIR/$slug.gz"
		gzip -9 -c "$file" >"$gz_src"
	fi

	if [ -n "$gz_src" ]; then
		printf '    http-request return status 200 content-type "%s"%s %s hdr Content-Encoding gzip file "%s" if { path %s } { req.hdr(Accept-Encoding) -m sub gzip }\n' \
			"$ct" "$base_hdrs" "$gz_etag_hdr" "$gz_src" "$url" >>"$BACKEND_FILE"
	fi
	printf '    http-request return status 200 content-type "%s"%s %s file "%s" if { path %s }\n' \
		"$ct" "$base_hdrs" "$etag_hdr" "$file" "$url" >>"$BACKEND_FILE"
}

add_tree() {
	root="$1"
	prefix="$2"
	[ -d "$root" ] || return 0
	find "$root" -type f | while IFS= read -r file; do
		rel=${file#"$root"/}
		case "$rel" in
			.*|*/.*|*.gz) continue ;;
		esac
		# nginx's `index index.html` for directories.
		if [ "$rel" = "index.html" ]; then
			add_file "/" "$file"
		fi
		add_file "$prefix$rel" "$file"
	done
}

generate_config() {
	# Remove stale generated payloads: files can disappear from the site dirs.
	rm -rf "$COMPRESSED_DIR"
	mkdir -p "$COMPRESSED_DIR"

	# Collect rules first, then prefix the backend section header so the rules
	# can be appended freely while walking the site directories.
	RULES_FILE="$GEN_DIR/static_rules.txt"
	: >"$RULES_FILE"
	BACKEND_FILE="$RULES_FILE"
	add_tree "$SITE_DIR" "/"
	add_tree "$ASSETS_DIR" "/assets/"
	add_tree "$STATIC_DIR" "/static/"
	# Built script is mapped to /script.js as well as /static/script.js.
	add_file "/script.js" "$STATIC_DIR/script.js"
	add_file "/favicon.ico" "$FAVICON"
	{
		printf '\nbackend be_static\n    mode http\n'
		cat "$RULES_FILE"
		printf '    http-request return status 404 content-type "text/plain; charset=utf-8" string "Not Found"\n'
	} >"$GEN_DIR/static_backend.cfg"

	# tune.bufsize must fit the largest payload plus response headers/rewrite.
	{
		[ -f "$FAVICON" ] && stat -c %s "$FAVICON"
		find "$SITE_DIR" "$ASSETS_DIR" "$STATIC_DIR" "$COMPRESSED_DIR" -type f 2>/dev/null | while IFS= read -r file; do
			stat -c %s "$file"
		done
	} | sort -n | tail -1 >"$GEN_DIR/max_size.txt"
	max_size=$(cat "$GEN_DIR/max_size.txt")
	[ -n "$max_size" ] || max_size=0
	buf_size=$(( (max_size + 16384 + 1023) / 1024 * 1024 ))
	[ "$buf_size" -lt 16384 ] && buf_size=16384
	{
		printf 'global\n'
		printf '    tune.bufsize %s\n' "$buf_size"
	} >"$BUF_FILE"

	echo "Generated $GEN_DIR/static_backend.cfg and $BUF_FILE (bufsize=${buf_size}, $(wc -l <"$GEN_DIR/static_backend.cfg") backend lines)"
}

generate_config
