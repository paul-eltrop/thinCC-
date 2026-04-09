# Vultr Deploy — chickentendr.club

Production deploy on a single Vultr VPS using Docker Compose + Caddy.
Same-origin path routing: frontend on `https://chickentendr.club/`,
backend on `https://chickentendr.club/api/*`.

## Stack

| Container | Image | Role |
|---|---|---|
| `caddy` | `caddy:2-alpine` | TLS termination + reverse proxy on 80/443 |
| `frontend` | built from `web/Dockerfile` | Next.js standalone, port 3000 (internal) |
| `backend` | built from `backend/Dockerfile` | FastAPI uvicorn, port 8000 (internal) |

Persistent state lives in:
- Supabase (postgres + storage + auth) — managed
- Qdrant Cloud (vector DB) — managed
- `caddy_data` volume — Let's Encrypt certs
- `hf_cache` volume — docling model cache (~1.5 GB), survives rebuilds

## Pre-flight

- Domain `chickentendr.club` registered at Porkbun, nameservers pointing to
  `ns1.vultr.com` / `ns2.vultr.com`, A-records `@` and `www` set to the
  Vultr IP in the Vultr DNS dashboard.
- Vultr Cloud Compute Regular 4 GB / 2 vCPU / Frankfurt / Ubuntu 24.04 x64
  with your SSH key installed.
- Local `backend/.env` filled out — you'll copy these values into the
  server's `.env`.

## One-time server setup

SSH in:

```bash
ssh root@<vultr-ip>
```

Update + install Docker:

```bash
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
docker --version
```

Firewall (only open 22, 80, 443):

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

Clone the repo into `/opt/thincc`:

```bash
mkdir -p /opt/thincc
cd /opt/thincc
git clone https://github.com/paul-eltrop/thinCC-.git .
```

Create the production env file:

```bash
cp .env.production.example .env
nano .env
```

Paste in the values from your local `backend/.env` (Supabase, Qdrant,
Google, OpenAI, Cohere keys). Save with `Ctrl+O`, exit with `Ctrl+X`.

## First deploy

Verify DNS resolves to this server:

```bash
dig +short chickentendr.club
```

Should print the Vultr IP. If empty or wrong, fix DNS at Porkbun /
Vultr DNS first — Caddy can't fetch a Let's Encrypt cert without it.

Build and start everything:

```bash
docker compose up -d --build
```

The first build takes **~10-15 minutes** because the backend image
pre-warms the docling models (~1.5 GB HuggingFace download). Subsequent
builds are seconds because the layer is cached.

Watch the logs:

```bash
docker compose logs -f
```

Wait until you see:
- `caddy` reports `certificate obtained successfully` for both
  `chickentendr.club` and `www.chickentendr.club`
- `backend` reports `Application startup complete`
- `frontend` reports `Ready in ...ms`

Smoke test:

```bash
curl https://chickentendr.club/api/health
```

Expect `{"status": "ok", "qdrant": {"collection": "...", "count": ...}}`.

Open `https://chickentendr.club` in a browser, log in, and run a real
end-to-end test (upload a doc, run a fit-check).

## Future deploys

```bash
ssh root@<vultr-ip>
cd /opt/thincc
git pull
docker compose up -d --build
docker compose logs -f --tail 100
```

The `hf_cache` volume keeps docling models warm, so subsequent rebuilds
only re-run pip install and the code copy step (~30 seconds).

## Troubleshooting

**Caddy can't get a cert**
```bash
docker compose logs caddy
```
Common causes: DNS not propagated yet, port 80/443 blocked by firewall,
already-issued cert hit Let's Encrypt rate limit (5 per week per domain).
Wait or use the staging endpoint by adding `acme_ca https://acme-staging-v02.api.letsencrypt.org/directory`
to the Caddyfile temporarily.

**502 Bad Gateway**
Backend or frontend container crashed. Check:
```bash
docker compose ps
docker compose logs backend
docker compose logs frontend
```
Most likely a missing env var in `.env`.

**Out of memory**
The 4 GB plan is tight when docling parses a large PDF. If you see
`Killed` in backend logs, upgrade in the Vultr dashboard:
Settings → Change Plan → next size up. Containers restart automatically.

**Docling re-downloads models on every restart**
The `hf_cache` volume isn't mounted. Verify:
```bash
docker volume ls | grep hf_cache
docker compose config | grep -A 2 hf_cache
```

**Frontend can't reach backend**
The frontend baked `NEXT_PUBLIC_API_URL=/api` into the build. If you
need to change this, rebuild the frontend image:
```bash
docker compose up -d --build frontend
```

## Maintenance

**View logs:**
```bash
docker compose logs -f --tail 200 backend
```

**Restart a single service:**
```bash
docker compose restart backend
```

**Stop everything:**
```bash
docker compose down
```

**Stop everything AND wipe volumes (destroys certs and model cache):**
```bash
docker compose down -v
```

**Disk usage:**
```bash
docker system df
df -h
```

**Prune old images after a deploy:**
```bash
docker image prune -f
```

## Follow-ups (not blocking)

- **Pin `backend/requirements.txt`** to specific versions for
  reproducible builds. Currently every rebuild can pull a newer
  haystack-ai / docling that might break things.
- **GitHub Actions auto-deploy** on push to `main` (SSH into the
  server, `git pull`, `docker compose up -d --build`).
- **Cloudflare proxy** in front of Caddy for DDoS protection + CDN
  caching for static assets.
- **Caddy upstream healthchecks** to fail fast when backend or
  frontend crashes — currently Caddy will return 502 until the
  container restarts.
- **Separate dev Supabase project** so production data isn't touched
  during local development.
