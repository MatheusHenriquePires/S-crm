## Operational knobs

- `PORT`: API port (default `3001`).
- `CORS_ORIGINS`: comma-separated list of allowed origins. Defaults to `http://localhost:5173`.
- `LOG_LEVEL`: pino log level (default `info`).
- `RATE_LIMIT_WINDOW_MS`: window in ms for rate limiting (default `60000`).
- `RATE_LIMIT_MAX`: max requests per window per account/user/IP (default `120`).

## HTTPS locally

- Run the API behind a TLS terminator/reverse proxy (e.g. Caddy, Traefik, Nginx) that terminates HTTPS and forwards to `http://localhost:3001`.
- Add your front-end origin (e.g. `https://localhost:5173`) to `CORS_ORIGINS`.
- If using self-signed certs (e.g. via `mkcert`), trust them in your browser/OS and configure your proxy to use the generated key/cert pair.
