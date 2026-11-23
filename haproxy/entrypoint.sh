#!/bin/sh
# Wait for the Bun build, generate HAProxy route/bufsize fragments, then start
# HAProxy. Structural config is static in haproxy/conf/*.cfg; only the per-file
# routes and tune.bufsize are generated (see generate-routes.sh).
#
# There is intentionally no ACME/certbot logic here: the TLS bundle is baked
# into the image at /etc/haproxy/certs/site.pem (see haproxy/certs/README.md).
set -eu

HAPROXY_PID=""
WATCHER_PID=""

shutdown() {
	if [ -n "$WATCHER_PID" ]; then
		kill -TERM "$WATCHER_PID" 2>/dev/null || true
	fi
	if [ -n "$HAPROXY_PID" ]; then
		kill -TERM "$HAPROXY_PID" 2>/dev/null || true
		wait "$HAPROXY_PID" 2>/dev/null || true
	fi
	exit 0
}
trap shutdown SIGTERM SIGINT SIGUSR1

BUN_MAX_WAIT="${BUN_MAX_WAIT:-120}"
DOMAIN="${DOMAIN:-}"
PIPELINE="${PIPELINE:-production}"
STATIC_DIR="${STATIC_DIR:-/staticfiles}"
SITE_DIR="${SITE_DIR:-/usr/share/site/src}"
ASSETS_DIR="${ASSETS_DIR:-/usr/share/site/assets}"
BUILD_MARKER="${BUILD_MARKER:-${STATIC_DIR}/.bun-build-complete}"

CONF_DIR="${HAPROXY_CONF_DIR:-/usr/local/etc/haproxy/conf}"
GEN_DIR="${GEN_DIR:-/run/haproxy/generated}"
CERT_FILE="${CERT_FILE:-/etc/haproxy/certs/site.pem}"
ROUTES_GENERATOR="${ROUTES_GENERATOR:-/generate-routes.sh}"

echo "Running in $PIPELINE mode"
if [ "$PIPELINE" = "production" ]; then
	if [ -z "$DOMAIN" ]; then
		echo "ERROR: DOMAIN must be set in production mode." >&2
		exit 1
	fi
	if [ ! -f "$CERT_FILE" ]; then
		echo "ERROR: TLS bundle not found at $CERT_FILE." >&2
		echo "       Create haproxy/certs/site.pem and rebuild the image." >&2
		exit 1
	fi
fi

wait_for_static_files() {
	echo "Waiting for Bun to finish building (${BUILD_MARKER})..."
	elapsed=0
	until [ -f "$BUILD_MARKER" ]; do
		if [ "$elapsed" -ge "$BUN_MAX_WAIT" ]; then
			echo "ERROR: timed out after ${BUN_MAX_WAIT}s waiting for Bun." >&2
			ls -la "$STATIC_DIR" 2>&1 | head -20 >&2 || true
			exit 1
		fi
		sleep 1
		elapsed=$((elapsed + 1))
	done
	# The marker is owned by the Bun container; only wait for it, don't delete it.
	echo "Bun build complete."
}

watch_changes() {
	echo "Watching site files and config for changes..."
	while inotifywait -q -r -e close_write,moved_to,create,delete,modify \
		"$CONF_DIR" "$SITE_DIR" "$ASSETS_DIR" "$STATIC_DIR"; do
		# Coalesce a burst of writes into one reload.
		while inotifywait -q -t 2 -e close_write,moved_to,create,delete,modify \
			"$CONF_DIR" "$SITE_DIR" "$ASSETS_DIR" "$STATIC_DIR"; do
			:
		done
		"$ROUTES_GENERATOR" || continue
		if haproxy -c -f "$CONF_DIR" -f "$GEN_DIR" >/dev/null 2>&1; then
			kill -USR2 "$HAPROXY_PID" 2>/dev/null || true
			echo "HAProxy config reloaded"
		else
			echo "HAProxy config test FAILED, keeping current config" >&2
		fi
	done
}

wait_for_static_files
"$ROUTES_GENERATOR"

if ! haproxy -c -f "$CONF_DIR" -f "$GEN_DIR"; then
	echo "ERROR: HAProxy config is invalid." >&2
	exit 1
fi

if [ "$PIPELINE" = "production" ] && [ -n "$DOMAIN" ]; then
	echo "Site URL: https://${DOMAIN}"
else
	echo "Site URL: http://localhost:${PORT_HTTP:-80}"
fi

echo "Starting HAProxy..."
haproxy -W -db -f "$CONF_DIR" -f "$GEN_DIR" &
HAPROXY_PID=$!

watch_changes &
WATCHER_PID=$!

wait "$HAPROXY_PID"
