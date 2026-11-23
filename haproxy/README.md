# HAProxy static-site setup

This directory is the HAProxy equivalent of the original `nginx/` setup. The
`nginx/` directory is kept only as a reference and is no longer used by
`compose.yml`.

## How it works

- `Dockerfile.haproxy` starts from `haproxy:3.2-alpine` and builds the
  certificate bundle from `certs/site.pem` into the image. There is no certbot,
  no ACME client and no automatic renewal. The image runs entirely as the
  unprivileged `haproxy` user.
- The container always binds 80/443. `PORT_HTTP` / `PORT_HTTPS` only control the
  host-side port mapping in `compose.yml`. The
  `net.ipv4.ip_unprivileged_port_start=80` sysctl allows the unprivileged user
  to bind these ports, so root is not required.
- `entrypoint.sh` waits for the Bun build marker, then walks the site
  directories and generates:
  - one `http-request return ... file ...` rule per static file (HAProxy serves
    the files directly, without another web server);
  - `Cache-Control`, CSP, Permissions-Policy, ETag and Last-Modified headers;
  - 304 responses for `If-None-Match` / `If-Modified-Since`;
  - gzip variants from `js/gzip.js` `.gz` sidecars, or freshly generated ones
    for source files such as `index.html` and `styles.css`;
  - `tune.bufsize` sized to the largest served file (HAProxy loads returned
    files into a buffer at config load).
- The config template is `haproxy.cfg`. Rendered output lives in
  `/run/haproxy/generated/haproxy.cfg` inside the container.
- In production, HTTP redirects to HTTPS and TLS is terminated by HAProxy with
  HTTP/2, HTTP/3 (QUIC) and `Alt-Svc`. In development, everything is served over
  HTTP only.
- Host-mounted config/site changes are picked up by an inotify watcher; the
  config is regenerated, validated, and HAProxy is reloaded with `SIGUSR2`.

## Routes

| URL                 | Source                                          |
| ------------------- | ----------------------------------------------- |
| `/`, `/index.html`  | `src/index.html`                                |
| `/<file>`           | any other file in `src/`                        |
| `/assets/*`         | `assets/`                                       |
| `/static/*`         | Bun build output (`STATIC_DIR`)                 |
| `/script.js`        | `STATIC_DIR/script.js`                          |
| `/favicon.ico`      | `haproxy/favicon.ico`                           |

## Limitations compared with nginx

- HAProxy has no `try_files`, so only files that exist at config generation
  time are served; new files trigger a reload via the inotify watcher.
- `Expires` is not emitted for `/favicon.ico` (only `Cache-Control` is).
- Rewrites/run-time PHP/WSGI-style upstreams are not supported; this is a
  static site only.

See `certs/README.md` for certificate and renewal instructions.
