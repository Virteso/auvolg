# TLS certificate bundle

The HAProxy container does **not** run certbot or any ACME client. Certificates
are baked into the image at build time, which suits a Cloudflare origin
certificate (or any manually managed certificate).

## Provide the certificate

Create a single PEM file named `site.pem` in this directory, containing the
certificate chain first and the private key last:

```sh
cat fullchain.pem privkey.pem > haproxy/certs/site.pem
chmod 600 haproxy/certs/site.pem
```

For Cloudflare, download the **origin certificate** and its private key from
SSL/TLS → Origin Server, then concatenate them in the same way (Cloudflare's
origin certificate is the "fullchain" equivalent here).

Then rebuild the image:

```sh
docker compose build haproxy
docker compose up -d haproxy
```

`site.pem` is listed in `.gitignore` so private keys are not committed.

## Renewal

Renewal is manual: replace `site.pem`, rebuild the image, and recreate the
container. In production, put the container behind Cloudflare's proxy (orange
cloud) so clients speak TLS to Cloudflare and HAProxy only serves the origin
certificate to Cloudflare.

## With `PIPELINE=development`

No certificate is needed. The HTTPS frontend is omitted entirely and the site
is served over plain HTTP on port 80.
