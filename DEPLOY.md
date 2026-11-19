# Deploying FinCore to a DigitalOcean droplet

One Ubuntu droplet runs everything with Docker Compose: SQL Server, Redis, the API (`fincore.api`, container
`fincore`, port 8080 inside the Docker network) and this client (`fincore.client`, container `fincore-client`,
nginx on port 80). Only the host reverse proxy is public: it terminates HTTPS and forwards to the client on
`127.0.0.1:8091`. The client serves the Angular app and proxies `/api/` to the API, so the browser only ever talks
to one origin (no CORS).

```
Internet ──443──> Caddy (host) ──> 127.0.0.1:8091 fincore-client (nginx :80) ──/api/──> fincore.api:8080
                                                                                       ├─> sqlserver:1433
                                                                                       └─> redis:6379
```

## 0. Before you start (backend repo — apply these yourself)

These are in `FinCore/docker-compose.yml` / the API image, which the client repo does not change:

1. **Email links need `AppSettings__FrontendBaseUrl`.** The confirmation and password-reset emails read
   `AppSettings:FrontendBaseUrl`, but the compose file only sets `AppSettings__BaseUrl`. In Production that value is
   then empty: confirmation links have no host, and *forgot password* fails with "AppSettings:BaseUrl is not
   configured.". The same setting is the CORS origin. Add to the `fincore.api` environment:
   `- AppSettings__FrontendBaseUrl=${FRONTEND_BASE_URL}` (e.g. `https://fincore.example.com`, no trailing slash).
2. **The API healthcheck can never pass.** It runs `curl`, which the `mcr.microsoft.com/dotnet/aspnet` image does
   not contain (`docker inspect fincore` shows `/bin/sh: curl: not found`), so `fincore` is always *unhealthy*.
   Install curl in the final stage of `FinCore/Dockerfile` (`USER root` → `apt-get update && apt-get install -y
   --no-install-recommends curl && rm -rf /var/lib/apt/lists/*` → `USER $APP_UID`) or change the check. Until then
   the client must use `condition: service_started` (the snippet below does).
3. **Client IPs in the audit log.** The API reads `Connection.RemoteIpAddress`; behind two proxies that is the
   client container's IP. To log real visitor IPs, add `app.UseForwardedHeaders(...)` with `XForwardedFor |
   XForwardedProto` and the Docker network as a known network. The client already sends `X-Forwarded-For`,
   `X-Real-IP` and `X-Forwarded-Proto`.
4. Swagger is enabled in every environment. It is only reachable on `127.0.0.1:8080`, since the client proxies
   `/api/` only, so it is not public.

### Client service for `FinCore/docker-compose.yml`

```yaml
  fincore.client:
    build:
      context: ../fincore-client
      dockerfile: Dockerfile
    image: fincore-client
    container_name: fincore-client
    depends_on:
      fincore.api:
        # service_healthy once the API healthcheck works (see 0.2)
        condition: service_started
    ports:
      - "127.0.0.1:8091:80"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://127.0.0.1/healthz"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
```

nginx resolves `fincore.api` through Docker's DNS at request time, so the client starts even if the API is not up
yet. Until the API answers, `/api/` returns 502 and the page itself still loads.

### `.env` next to `docker-compose.yml` (values are secrets: never commit this file)

| Variable | Meaning |
|---|---|
| `ASPNETCORE_ENVIRONMENT` | `Production` |
| `MSSQL_SA_PASSWORD` | SQL Server `sa` password (strong: upper, lower, digit, symbol, ≥ 8) |
| `JWT_SECRET` | long random string (≥ 32 bytes), e.g. `openssl rand -base64 48` |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | profile photos |
| `SMTP_SENDER`, `SMTP_USERNAME`, `SMTP_PASSWORD` | Brevo SMTP relay (confirmation and reset emails) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_PERSONAL_NUMBER`, `ADMIN_PHONE_NUMBER`, `ADMIN_FIRST_NAME`, `ADMIN_LAST_NAME` | the seeded first admin |
| `APP_BASE_URL` | public base URL (`https://<your-domain>`) |
| `FRONTEND_BASE_URL` | the same public URL, used in email links and CORS (needs the compose line from 0.1) |

## 1. Server setup

```bash
# as root, once
adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy   # reuse your SSH key
# log in again as deploy, then:
sudo apt update && sudo apt upgrade -y
sudo ufw allow OpenSSH          # 22
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

Optional: disable password and root SSH logins in `/etc/ssh/sshd_config` (`PasswordAuthentication no`,
`PermitRootLogin no`), then `sudo systemctl restart ssh`. SQL Server needs about 2 GB of RAM: use a droplet with
at least 4 GB, or add swap.

## 2. Docker

```bash
# official repository (https://docs.docker.com/engine/install/ubuntu/)
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker deploy    # log out and in again
docker version && docker compose version
```

Published ports bound to `127.0.0.1` (1434, 8080, 8091) are not reachable from outside. Note that Docker's own
iptables rules bypass ufw for ports published on `0.0.0.0`, so keep every mapping on `127.0.0.1`.

## 3. Code and configuration

```bash
mkdir -p ~/apps && cd ~/apps
git clone <FinCore repo URL> FinCore
git clone <fincore-client repo URL> fincore-client   # must be a sibling: the compose build context is ../fincore-client
cd FinCore
nano .env            # see the table above
chmod 600 .env
```

## 4. Start

```bash
cd ~/apps/FinCore
docker compose up -d --build
docker compose ps                     # sqlserver/redis healthy, fincore-client healthy
curl -I http://127.0.0.1:8091/healthz # 200
curl -I http://127.0.0.1:8091/        # 200 text/html
```

The first start takes a few minutes: SQL Server initialises, the API applies migrations and seeds the admin.

## 5. HTTPS reverse proxy on the host (Caddy)

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`:

```
fincore.example.com {
    encode zstd gzip
    header Strict-Transport-Security "max-age=31536000; includeSubDomains"
    reverse_proxy 127.0.0.1:8091
}
```

```bash
sudo systemctl reload caddy
```

Caddy obtains and renews the Let's Encrypt certificate automatically and sends `X-Forwarded-For` /
`X-Forwarded-Proto`, which the client passes on to the API.

**Alternative:** nginx on the host plus certbot (`sudo apt install nginx certbot python3-certbot-nginx`). Use a
server block with `proxy_pass http://127.0.0.1:8091;` and the same `X-Forwarded-*` headers, then run
`sudo certbot --nginx -d fincore.example.com` (it renews by itself through a systemd timer).

## 6. DNS

At your DNS provider, create an **A record** `fincore.example.com → <droplet IPv4>` (and an AAAA record for IPv6
if the droplet has one). Wait until `dig +short fincore.example.com` returns the droplet IP *before* starting
Caddy with the domain, otherwise the certificate request fails (Caddy retries later). Then set `APP_BASE_URL` and
`FRONTEND_BASE_URL` in `.env` to `https://fincore.example.com` and run `docker compose up -d` again.

## 7. Logs and updates

```bash
cd ~/apps/FinCore
docker compose ps
docker compose logs -f fincore.api        # API
docker compose logs -f fincore.client     # nginx access/error log (stdout)
docker compose logs --tail=200 sqlserver
sudo journalctl -u caddy -f               # HTTPS proxy

# update
cd ~/apps/fincore-client && git pull
cd ~/apps/FinCore && git pull
docker compose up -d --build              # rebuilds changed images, restarts only what changed
docker image prune -f                     # remove old image layers
```

Data lives in the named volumes `fincore_sqlserver_data` and `fincore_redis_data`. Back up the database with
`sqlcmd BACKUP DATABASE` into a mounted folder or a volume snapshot before risky updates.

## 8. Content-Security-Policy

The client sends the CSP as **`Content-Security-Policy-Report-Only`** first (see
`nginx/security-headers.conf`). After deploying, open the browser DevTools console and click through every
screen. If nothing reports a CSP violation, rename the header to `Content-Security-Policy`, rebuild
(`docker compose up -d --build fincore.client`) and repeat the smoke test.

## 9. Smoke test after deployment

- [ ] `https://<domain>/` shows the landing page over HTTPS (valid certificate); `/healthz` returns `ok`.
- [ ] Register a customer, receive the **confirmation email**, and check that its link opens `https://<domain>/confirm-email?...` → confirm with the code.
- [ ] Log in → the dashboard opens; the profile name appears in the menu.
- [ ] Profile photo upload (≤ 2 MB) works and the photo shows (Cloudinary image allowed by the CSP).
- [ ] Open a GEL account and a USD account → **deposit** into the GEL account.
- [ ] **Transfer** to another customer by account number and by personal number; download the PDF receipt.
- [ ] **Conversion** GEL → USD (quote shows NBG rate and fee, confirm, receipt).
- [ ] Create a **virtual card** (the full number is shown once) → **Demo Shop**: pay an approved order, then a declined one (over the 400 per-payment limit).
- [ ] Analytics page shows charts.
- [ ] Log in as **manager**: monitoring dashboard, transfers + ledger, accounts + transactions, conversions, suspicious activities (review → resolve).
- [ ] Log in as **admin**: users (search, detail, ban → the banned user is logged out on the next call; unban), create staff, audit logs, freeze/unfreeze an account.
- [ ] **F5 on a deep link** (e.g. `/manager/accounts/1`, `/transfers?page=2`) keeps you on the same page, still signed in.
- [ ] **Forgot password**: the email link opens `https://<domain>/reset-password?...` (the query string disappears from the address bar), the new password works.
- [ ] An unknown URL shows "Page not found" with "Go to home".
- [ ] DevTools console: no CSP violations (then switch the CSP to enforcing, see 8).
