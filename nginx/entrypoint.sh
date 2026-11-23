#!/bin/sh
set -e

# Signal handler for graceful shutdown
shutdown() {
	if [ -n "${PID:-}" ]; then
		kill -TERM "$PID" 2>/dev/null || true
		wait "$PID" 2>/dev/null || true
	fi
	exit 0
}
trap shutdown SIGTERM SIGINT

BUN_MAX_WAIT="${BUN_MAX_WAIT:-120}"

DOMAIN="${DOMAIN}"
PIPELINE="${PIPELINE:-production}"

CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
EMAIL="${LETSENCRYPT_EMAIL:-mail@example.com}"

STATIC_DIR="${STATIC_DIR:-/staticfiles}"
BUILD_MARKER="${BUILD_MARKER:-${STATIC_DIR}/.bun-build-complete}"

SITE_DIR="${SITE_DIR:-/usr/share/site/src}"
ASSETS_DIR="${ASSETS_DIR:-/usr/share/site/assets}"
PORT_HTTP="${PORT_HTTP:-80}"
PORT_HTTPS="${PORT_HTTPS:-443}"

GENERATED_DIR="/etc/nginx/generated"
mkdir -p "$GENERATED_DIR"
GENERATED_STATIC_ALIAS="$GENERATED_DIR/static-alias.conf"
GENERATED_STATIC_ROOT="$GENERATED_DIR/static-root.conf"
GENERATED_SITE_ROOT="$GENERATED_DIR/site-root.conf"
GENERATED_ASSETS_ALIAS="$GENERATED_DIR/assets-alias.conf"
GENERATED_SCRIPT_ALIAS="$GENERATED_DIR/script-alias.conf"
GENERATED_SERVER_NAME="$GENERATED_DIR/server_name.conf"

# Resolve the static files location for snippets/static.conf
render_static_alias() {
    escaped=$(printf '%s' "$STATIC_DIR" | sed -e 's/[\\"]/\\&/g')
    printf 'alias "%s/";\n' "$escaped" >"$GENERATED_STATIC_ALIAS"
    printf 'root "%s";\n' "$escaped" >"$GENERATED_STATIC_ROOT"
    echo "Resolved /static/ alias for ${STATIC_DIR}"
}

# Resolve static site locations for snippets/site.conf
render_site_paths() {
    escaped_site=$(printf '%s' "$SITE_DIR" | sed -e 's/[\\"]/\\&/g')
    escaped_assets=$(printf '%s' "$ASSETS_DIR" | sed -e 's/[\\"]/\\&/g')
    escaped_static=$(printf '%s' "$STATIC_DIR" | sed -e 's/[\\"]/\\&/g')
    printf 'root "%s";\n' "$escaped_site" >"$GENERATED_SITE_ROOT"
    printf 'alias "%s/";\n' "$escaped_assets" >"$GENERATED_ASSETS_ALIAS"
    printf 'alias "%s/script.js";\n' "$escaped_static" >"$GENERATED_SCRIPT_ALIAS"
    echo "Resolved site root for ${SITE_DIR}, assets for ${ASSETS_DIR}, script for ${STATIC_DIR}/script.js"
}

render_server_name() {
	# Create server_name alias
	if [ -n "$DOMAIN" ]; then
    	server_names="$DOMAIN www.$DOMAIN localhost 127.0.0.1"
	else
    	server_names="localhost 127.0.0.1"
	fi
	printf 'server_name %s;\n' "$server_names" > "$GENERATED_SERVER_NAME"
	echo "Resolved server_name for ${DOMAIN} and www.${DOMAIN}"
}

render_static_alias
render_site_paths
render_server_name

print_site_url() {
    if [ "$PIPELINE" = "production" ] && [ -n "$DOMAIN" ]; then
        echo "Site URL: https://${DOMAIN}:${PORT_HTTPS}"
    else
        echo "Site URL: http://localhost:${PORT_HTTP}"
    fi
}

# Function to start nginx
start_nginx() {
    echo "Starting nginx..."
    print_site_url
    exec nginx -g "daemon off;"
}

# Reload nginx when a watched config file changes, but only if it passes the
# config test. This lets host-mounted config edits take effect in dev without
# recreating the container, without ever loading a broken config.
watch_and_reload_nginx() {
    echo "Watching nginx config for changes..."
    while inotifywait -q -r -e close_write,moved_to,create,delete,modify \
        /etc/nginx/nginx.conf \
        /etc/nginx/snippets \
        /etc/nginx/sites-enabled \
        /etc/nginx/dev.conf \
        /etc/nginx/prod.conf; do
        # Debounce: wait for a quiet period so a burst of writes coalesces into one reload.
        while inotifywait -q -t 2 -e close_write,moved_to,create,delete,modify \
            /etc/nginx/nginx.conf \
            /etc/nginx/snippets \
            /etc/nginx/sites-enabled \
            /etc/nginx/dev.conf \
            /etc/nginx/prod.conf; do
            :
        done
        render_static_alias
        render_site_paths
        if nginx -t 2>/dev/null; then
            nginx -s reload 2>/dev/null || true
            echo "nginx config OK, reloaded"
        else
            echo "nginx config test FAILED, keeping current config"
        fi
    done
}

wait_for_static_files() {
	echo "Waiting for Bun to finish building (${BUILD_MARKER})..."
	local elapsed=0
	until [ -f "$BUILD_MARKER" ]; do
		if [ "$elapsed" -ge "$BUN_MAX_WAIT" ]; then
			echo "ERROR: Timed out after ${BUN_MAX_WAIT}s waiting for Bun to finish building." >&2
			echo "State of ${STATIC_DIR} at timeout:" >&2
			ls -la "$STATIC_DIR" 2>&1 | head -20 >&2 || true
			return 1
		fi
		sleep 1
		elapsed=$((elapsed + 1))
	done
	rm "$BUILD_MARKER"
	echo "Bun build complete."
	return $?
}


# Select appropriate config based on PIPELINE
if [ "$PIPELINE" = "production" ]; then
    CONFIG_SOURCE="/etc/nginx/prod.conf"
    echo "Running in production mode"
else
    CONFIG_SOURCE="/etc/nginx/dev.conf"
    echo "Running in $PIPELINE mode (no SSL)"
fi

# Symlink the appropriate config to sites-enabled
ln -sf "$CONFIG_SOURCE" /etc/nginx/sites-enabled/server.conf

wait_for_static_files &
STATIC_PIPELINE_PID=$!
if ! wait "$STATIC_PIPELINE_PID"; then
	echo "ERROR: Bun build never completed or failed." >&2
	exit 1
fi

# Check if running in production
if [ "$PIPELINE" != "production" ]; then
    echo "Skipping certificate management"
    watch_and_reload_nginx &
    start_nginx
fi

# Production mode: manage certificates
echo "Managing certificates..."

# Check if certificate exists and is valid
if [ -f "$CERT_DIR/fullchain.pem" ] && [ -f "$CERT_DIR/privkey.pem" ]; then
    echo "Certificate found for $DOMAIN"

    # Try to renew certificate (runs renewal checks, only renews if needed)
    echo "Checking certificate renewal..."
    certbot renew \
        --nginx \
        --quiet \
        --agree-tos \
        --non-interactive \
        2>/dev/null || true

    start_nginx
else
    echo "No certificate found. Starting temporary nginx for certificate generation..."

    # Start nginx in background so certbot-nginx can inspect and update the live server config
    nginx -g "daemon off;" &
    NGINX_PID=$!

    # Wait for nginx to start
    sleep 2

    # Run certbot with the nginx plugin
    echo "Requesting certificate for $DOMAIN..."
    certbot certonly \
        --nginx \
        -d "$DOMAIN" \
        -d "www.$DOMAIN" \
        --email "$EMAIL" \
        --agree-tos \
        --non-interactive \
        --no-eff-email \
        2>&1 || {
        echo "Failed to obtain certificate"
        kill $NGINX_PID 2>/dev/null || true
        exit 1
    }

    echo "Certificate obtained successfully"

    # Stop background nginx
    kill $NGINX_PID 2>/dev/null || true
    wait $NGINX_PID 2>/dev/null || true

    # Start nginx normally
    start_nginx
fi
