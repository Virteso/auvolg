# avolg
Infoleht firmale Auvõlg OÜ

## Running

The site is served by HAProxy (no nginx, no certbot).

1. Copy `.env.example` to `.env` and set `DOMAIN` for production.
2. For production, create `haproxy/certs/site.pem` containing the certificate
   chain followed by the private key (see `haproxy/certs/README.md`). No
   certificate is needed when `PIPELINE` is not `production`.
3. Build and start:

   ```sh
   docker compose up -d --build
   ```

`PORT_HTTP` / `PORT_HTTPS` map host ports to the container's fixed 80/443. On a
dev machine keep `8080`/`8443` with any `PIPELINE` other than `production`. In
production set `PORT_HTTP=80`, `PORT_HTTPS=443` and `PIPELINE=production`;
`compose.yml` sets `net.ipv4.ip_unprivileged_port_start=80`, so the container
does not need root. HTTPS uses HTTP/2, HTTP/3 and redirects HTTP to HTTPS.

See `haproxy/README.md` for details on the generated config and `nginx/` for
the previous configuration, kept as a reference.
