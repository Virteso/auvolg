# HAProxy static-site setup

This directory is the HAProxy equivalent of the original `nginx/` setup. The
`nginx/` directory is kept only as a reference and is no longer used by
`compose.yml`.

## Layout

- `conf/` — **static**, hand-editable HAProxy config, loaded in filename order:
  - `00-global.cfg` — globals (maxconn, TLS defaults, logging). `tune.bufsize` is
    *not* here; the entrypoint generates it.
  - `10-defaults.cfg` — HTTP mode, timeouts, logging options.
  - `20-http.cfg` — port 80 frontend; in production redirects to HTTPS via
    `.if streq("$PIPELINE",production)`.
  - `30-https.cfg` — port 443 TLS frontend (HTTP/2, HTTP/3, Alt-Svc), only in
    production.
- `entrypoint.sh` — small runtime script. It waits for the Bun build marker,
  then generates only the bits HAProxy cannot express statically:
  - `generated/bufsize.cfg` — `global` + `tune.bufsize` sized to the largest
    served file (HAProxy loads `file` payloads into buffers at config parse).
  - `generated/static_backend.cfg` — `backend be_static` with one
    `http-request return ... file ...` rule per static file, plus
    Cache-Control/CSP/Permissions-Policy/ETag/Last-Modified, 304 rules, gzip
    variants (`.gz` sidecars from `js/gzip.js` or freshly compressed), and a 404
    fallback.
- `Dockerfile.haproxy` — `haproxy:3.2-alpine`, bakes in `conf/`, favicon, certs;
  runs as the unprivileged `haproxy` user.
- `certs/` — `site.pem` (fullchain + key) is baked into the image. No certbot /
  no automatic renewal.

The container runs as `haproxy -f conf -f generated` (HAProxy merges multiple
config files/directories). Host-mounted `conf/`, `src/`, `assets/`, and
`staticfiles` are watched by inotify; on change the generated fragments are
regenerated, the full config is validated, and HAProxy is reloaded via `SIGUSR2`.

## Routes

| URL                 | Source                                          |
| ------------------- | ----------------------------------------------- |
| `/`, `/index.html`  | `src/index.html`                                |
| `/<file>`           | any other file in `src/`                        |
| `/assets/*`         | `assets/`                                       |
| `/static/*`         | Bun build output (`STATIC_DIR`)                 |
| `/script.js`        | `STATIC_DIR/script.js`                          |
| `/favicon.ico`      | `haproxy/favicon.ico`                           |

## Ports / TLS

The container always binds 80/443. `PORT_HTTP`/`PORT_HTTPS` in `.env` only map
host ports. `compose.yml` sets `net.ipv4.ip_unprivileged_port_start=80` so the
unprivileged user can bind 80/443 — no root required. Production uses HTTP/2,
HTTP/3 (QUIC), and `Alt-Svc`; development serves plain HTTP only.

## Limitations compared with nginx

- HAProxy has no `try_files`, so only files present at generation time are
  served; new files are picked up by the inotify reload.
- `Expires` is not emitted for `/favicon.ico` (only `Cache-Control`).
- Static files only; no runtime upstream/proxying.

See `certs/README.md` for certificate and renewal instructions.
