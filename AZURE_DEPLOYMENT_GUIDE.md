# Deploying Production RAG on Azure for Students

This guide deploys:

- Backend: FastAPI in Docker
- Database: PostgreSQL + pgvector + ParadeDB pg_search in Docker
- Cache/rate limiting: Redis in Docker
- HTTPS: Caddy in Docker
- Frontend: React/Vite on Azure Static Web Apps

The backend runs on one Azure Ubuntu virtual machine. The frontend is a separate static Azure Static Web App.

---

## 1. Final architecture

```text
Azure Static Web Apps
https://YOUR_APP_NAME.azurestaticapps.net
        |
        | HTTPS API calls
        v
Azure Ubuntu VM
        |
        +-- Caddy (ports 80 and 443 only)
        |       |
        |       v
        +-- FastAPI container (internal port 8000)
        |
        +-- ParadeDB container (Postgres + pg_search + pgvector)
        |
        +-- Redis container (rate limiting)
```

Only Caddy is exposed on the VM. Postgres and Redis stay on the private Docker network. The frontend has no VM component.

---

## 2. What you need

1. An Azure for Students account.
2. A GitHub repository containing this project.
3. A domain or subdomain for the API, for example `api.yourdomain.com`.
   - If you do not want to buy a domain, use a free DuckDNS subdomain.
4. An Azure Static Web Apps resource for the frontend, created later.
5. About 30-60 minutes for the first deployment.

Important cost note: Azure for Students gives 100 USD credit for 12 months. A small VM running 24/7 will consume that credit over time. Set a budget alert and stop/deallocate the VM when you are not using it. Azure Static Web Apps Free tier is enough for this project.

---

## 3. Code changes needed before deployment

### 3.1 Configure backend CORS

`app/main.py` already reads origins from `CORS_ORIGINS`, so no code change is needed. Add your Static Web App origin to `.env` on the VM:

```env
CORS_ORIGINS=http://localhost:5173,https://YOUR_APP_NAME.azurestaticapps.net
```

If your Static Web App uses a custom domain, add that domain too.

Do not put a trailing slash on an origin. This is correct:

```text
https://YOUR_APP_NAME.azurestaticapps.net
```

This is wrong:

```text
https://YOUR_APP_NAME.azurestaticapps.net/
```

Rebuild the API after changing this value:

```bash
docker compose -f docker-compose.prod.yml up -d --build api
```

### 3.2 Fix the frontend API URL

Right now `frontend/src/services/api.js` is hardcoded to localhost:

```javascript
baseURL: "http://localhost:8000",
```

Change it to:

```javascript
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
});
```

Later, GitHub Actions will set `VITE_API_URL` to your HTTPS API URL.

### 3.3 Keep the Vite base path at root

Azure Static Web Apps serves the frontend at the root of its hostname, for example `https://YOUR_APP_NAME.azurestaticapps.net`. Leave `base` unset in `frontend/vite.config.js` (or set `base: "/"`). Do not use a repository-name path prefix like GitHub Pages.

### 3.4 Handle React Router refreshes on Azure Static Web Apps

The frontend uses `BrowserRouter`. Direct visits to `/login` or `/conversations/...` need a navigation fallback. Create `frontend/public/staticwebapp.config.json`:

```json
{
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/assets/*", "/*.{css,js,ico,png,svg}"]
  }
}
```

Vite copies `public/` into `dist/`, so the file is deployed with the site. No `404.html` copy step is needed.

---

## 4. Create the Azure virtual machine

In the Azure Portal:

1. Open **Azure for Students** and verify your student account.
2. Create a **Resource group**, for example `rag-production-rg`.
3. Create a **Virtual machine**.
4. Use these settings:

| Setting | Value |
|---|---|
| Image | Ubuntu Server 24.04 LTS |
| Size | Standard_B2s (2 vCPU, 4 GB RAM) |
| Authentication | SSH public key |
| Username | `azureuser` |
| OS disk | 64 GB Standard SSD |
| Public inbound ports | SSH (22), HTTP (80), HTTPS (443) |
| Public IP | Standard, Static |

`B1s` with 1 GB RAM is too small for the embedding model, Postgres, and Redis together. Start with `B2s`. If the Docker build runs out of memory, use `B2ms` (8 GB) temporarily.

After creation, copy the VM public IP address.

### 4.1 Firewall rules

In the VM's **Networking** settings, allow:

- `22` from your own IP only, if possible
- `80` from anywhere
- `443` from anywhere

Do not allow inbound:

- `5432` (Postgres)
- `6379` (Redis)
- `8000` (FastAPI)

Those services are reached only inside the Docker network.

### 4.2 Optional: budget alert

Go to **Cost Management + Billing > Budgets** and create an alert at 10 USD and 50 USD.

A budget is an alert, not a hard spending cap. Also consider Azure **Auto-shutdown** for development hours.

---

## 5. Connect to the VM and install Docker

Connect from your computer:

```bash
ssh azureuser@YOUR_VM_PUBLIC_IP
```

On the VM:

```bash
sudo apt update
sudo apt upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

Verify:

```bash
docker --version
docker compose version
```

Enable the firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

Docker publishes only ports 80 and 443. Postgres and Redis have no published host ports, so they are not reachable from the internet.

---

## 6. Point a domain to the VM

Pick one option.

### Option A: Your own domain

In your DNS provider, create an `A` record:

```text
api.yourdomain.com  ->  YOUR_VM_PUBLIC_IP
```

If you use Cloudflare, set the record to **DNS only** for the first certificate setup. A proxied record can interfere with the initial HTTP challenge.

### Option B: Free DuckDNS domain

1. Go to `https://www.duckdns.org`.
2. Create a subdomain, for example `rag-api`.
3. Point it to `YOUR_VM_PUBLIC_IP`.

Your API hostname becomes:

```text
rag-api.duckdns.org
```

Caddy will obtain a free HTTPS certificate automatically.

---

## 7. Put the project on the VM

On the VM:

```bash
mkdir -p ~/production-rag
cd ~/production-rag
```

Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git .
```

If the repository is private, use a GitHub deploy key or a personal access token. Do not paste secrets into shell history on a shared machine.

Check that these files exist:

```bash
ls
ls app
ls frontend
```

---

## 8. Create the production environment file

Create `.env` on the VM in `~/production-rag`:

```bash
nano .env
```

Use this template and replace every placeholder:

```env
POSTGRES_PASSWORD=CHANGE_ME_DB_PASSWORD
REDIS_PASSWORD=CHANGE_ME_REDIS_PASSWORD

DATABASE_URL=postgresql+psycopg://postgres:CHANGE_ME_DB_PASSWORD_URL_ENCODED@paradedb:5432/production_rag

JWT_SECRET_KEY=CHANGE_ME_LONG_RANDOM_SECRET
GROQ_API_KEY=CHANGE_ME_GROQ_KEY

CLOUDINARY_CLOUD_NAME=CHANGE_ME
CLOUDINARY_API_KEY=CHANGE_ME
CLOUDINARY_API_SECRET=CHANGE_ME

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_USERNAME=default
REDIS_PASSWORD=CHANGE_ME_REDIS_PASSWORD

CORS_ORIGINS=http://localhost:5173,https://YOUR_APP_NAME.azurestaticapps.net
```

Important details:

- `DATABASE_URL` uses the Docker service name `paradedb`.
- `REDIS_HOST` uses the Docker service name `redis`.
- `POSTGRES_PASSWORD` is the raw password.
- The password inside `DATABASE_URL` must be URL-encoded.

For example, if the database password is:

```text
my@pass:123
```

then the URL-encoded form is:

```text
my%40pass%3A123
```

To avoid encoding mistakes, use a password with only letters, numbers, hyphens, and underscores. For example:

```bash
openssl rand -hex 16
```

Use that value for `POSTGRES_PASSWORD` and for the password part of `DATABASE_URL`. Do not use `$` in these passwords because Docker Compose also treats `$` specially.

Generate a JWT secret:

```bash
openssl rand -hex 32
```

Protect the file:

```bash
chmod 600 .env
```

Never commit `.env` to GitHub.

---

## 9. Create the production Docker Compose file

The existing `docker-compose.yml` expects an external `rag-net` network and an already-running container named `paradedb-rag-clean`. Do not use that file for this deployment.

Create `docker-compose.prod.yml` on the VM:

```yaml
services:
  paradedb:
    image: paradedb/paradedb:latest
    container_name: paradedb
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: production_rag
    volumes:
      - paradedb_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d production_rag"]
      interval: 10s
      timeout: 5s
      retries: 10
    restart: unless-stopped
    networks:
      - rag

  redis:
    image: redis:7-alpine
    container_name: redis
    command:
      - redis-server
      - --requirepass
      - ${REDIS_PASSWORD}
      - --appendonly
      - "yes"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "--no-auth-warning", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 10
    restart: unless-stopped
    networks:
      - rag

  api:
    build: .
    container_name: rag-api
    env_file:
      - .env
    depends_on:
      paradedb:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - uploads_data:/app/uploads
    expose:
      - "8000"
    restart: unless-stopped
    networks:
      - rag

  caddy:
    image: caddy:2-alpine
    container_name: caddy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - api
    restart: unless-stopped
    networks:
      - rag

volumes:
  paradedb_data:
  redis_data:
  uploads_data:
  caddy_data:
  caddy_config:

networks:
  rag:
```

Why these choices:

- `paradedb` has no `ports`. Only other containers can reach it.
- `redis` has no `ports`. Only other containers can reach it.
- `api` uses `expose` instead of `ports`. Caddy reaches it through the Docker network.
- `caddy` publishes only 80 and 443.
- Named volumes preserve the database, Redis data, uploads, and TLS certificates across restarts.

---

## 10. Create the Caddyfile

Create `Caddyfile` in `~/production-rag`:

```text
{
    email YOUR_EMAIL_ADDRESS
}

api.yourdomain.com {
    reverse_proxy api:8000
}
```

Replace `api.yourdomain.com` with your real API hostname.

If you use DuckDNS, use something like:

```text
rag-api.duckdns.org {
    reverse_proxy api:8000
}
```

Caddy will automatically request and renew a Let's Encrypt certificate.

---

## 11. Start the database and Redis first

From `~/production-rag`:

```bash
docker compose -f docker-compose.prod.yml up -d paradedb redis
```

Wait until both are healthy:

```bash
docker compose -f docker-compose.prod.yml ps
```

You want `paradedb` and `redis` to show `healthy`.

If they do not:

```bash
docker compose -f docker-compose.prod.yml logs paradedb
docker compose -f docker-compose.prod.yml logs redis
```

---

## 12. Initialize the database

The app uses `app/db/init_db.py`, which calls SQLAlchemy `create_all`. It does not install Postgres extensions, so create extensions first.

### 12.1 Enable pgvector and pg_search

```bash
docker compose -f docker-compose.prod.yml exec -T paradedb \
  psql -U postgres -d production_rag \
  -c "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pg_search;"
```

Verify:

```bash
docker compose -f docker-compose.prod.yml exec -T paradedb \
  psql -U postgres -d production_rag \
  -c "\dx"
```

You should see `vector` and `pg_search`.

### 12.2 Create the application tables

```bash
docker compose -f docker-compose.prod.yml run --rm api python -m app.db.init_db
```

The first run builds the API image and downloads the embedding model. This can take several minutes.

### 12.3 Create search indexes

The app uses `pdb.score()` for BM25 and `<=>` for vector search. Create the indexes:

```bash
docker compose -f docker-compose.prod.yml exec -T paradedb \
  psql -U postgres -d production_rag <<'SQL'
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
ON document_chunks
USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS document_chunks_bm25_idx
ON document_chunks
USING paradedb (chunk_id, chunk_text)
WITH (key_field = 'chunk_id');
SQL
```

Notes:

- ParadeDB 0.25 and newer use `USING paradedb`. `USING bm25` is still accepted as an alias.
- If your ParadeDB image rejects `key_field` or the UUID key field, inspect the working database with `\d document_chunks` and copy its exact BM25 index definition.
- If you already have a working local database, the safest path is to dump and restore it instead of recreating extensions and indexes manually. See section 12.4.

### 12.4 Optional: copy your existing database

If you already have users, conversations, and chunks locally, restore them instead of starting empty.

On your local machine, find your current ParadeDB container name:

```bash
docker ps
```

Dump the database:

```bash
docker exec -t YOUR_LOCAL_PARADEDB_CONTAINER \
  pg_dump -U postgres -d production_rag -Fc -f /tmp/production_rag.dump

docker cp YOUR_LOCAL_PARADEDB_CONTAINER:/tmp/production_rag.dump .
```

Copy it to the VM:

```bash
scp production_rag.dump azureuser@YOUR_VM_PUBLIC_IP:/home/azureuser/production-rag/
```

On the VM, restore it:

```bash
cd ~/production-rag

docker compose -f docker-compose.prod.yml exec -T paradedb \
  pg_restore -U postgres -d production_rag --clean --if-exists < production_rag.dump
```

If you restore an existing database, skip the manual `init_db` and index creation steps because the dump already contains the schema and indexes.

---

## 13. Start the full stack

```bash
cd ~/production-rag
docker compose -f docker-compose.prod.yml up -d
```

Check status:

```bash
docker compose -f docker-compose.prod.yml ps
```

All four services should be running. `paradedb` and `redis` should be healthy.

Watch the API logs:

```bash
docker compose -f docker-compose.prod.yml logs -f api
```

Watch Caddy logs if HTTPS fails:

```bash
docker compose -f docker-compose.prod.yml logs -f caddy
```

Test the API:

```bash
curl -I https://api.yourdomain.com/docs
```

A `200` or `307` response means Caddy and FastAPI are reachable.

---

## 14. Deploy the frontend to GitHub Pages

### 14.1 Configure GitHub Pages

In the GitHub repository:

1. Open **Settings > Pages**.
2. Set **Source** to **GitHub Actions**.

### 14.2 Add the workflow

Create `.github/workflows/deploy-frontend.yml`:

```yaml
name: Deploy frontend

on:
  push:
    branches: ["main"]
    paths:
      - "frontend/**"
      - ".github/workflows/deploy-frontend.yml"
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - run: npm ci

      - run: npm run build
        env:
          VITE_API_URL: https://api.yourdomain.com

      - run: cp dist/index.html dist/404.html

      - uses: actions/upload-pages-artifact@v3
        with:
          path: frontend/dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Replace `VITE_API_URL` with your HTTPS API address.

### 14.3 CORS reminder

The browser will send requests from:

```text
https://YOUR_GITHUB_USERNAME.github.io
```

Make sure that exact origin is in `CORS_ORIGINS` on the VM, then rebuild/restart the API:

```bash
docker compose -f docker-compose.prod.yml up -d --build api
```

---

## 15. End-to-end test

Open the GitHub Pages site and test:

1. Sign up.
2. Log in.
3. Create a new chat.
4. Upload a PDF.
5. Ask a question about the PDF.
6. Delete a conversation.

If something fails, open the browser developer tools:

- **Console**: CORS or mixed-content errors.
- **Network**: request URL and status code.

Useful server checks:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=100 api
docker compose -f docker-compose.prod.yml logs --tail=100 caddy
```

---

## 16. Updating the application

Pull the latest code:

```bash
cd ~/production-rag
git pull
```

Rebuild and restart the backend:

```bash
docker compose -f docker-compose.prod.yml up -d --build api
```

If you changed `docker-compose.prod.yml` or `Caddyfile`:

```bash
docker compose -f docker-compose.prod.yml up -d
```

If you changed only frontend code, push to `main` and GitHub Actions will redeploy it.

---

## 17. Backups

Create a database backup:

```bash
cd ~/production-rag

docker compose -f docker-compose.prod.yml exec -T paradedb \
  pg_dump -U postgres -d production_rag -Fc \
  > backup-$(date +%F).dump
```

Download it to your computer:

```bash
scp azureuser@YOUR_VM_PUBLIC_IP:~/production-rag/backup-2026-01-01.dump .
```

Restore a backup:

```bash
docker compose -f docker-compose.prod.yml exec -T paradedb \
  pg_restore -U postgres -d production_rag --clean --if-exists < backup-2026-01-01.dump
```

Keep backups outside the VM. A VM disk failure should not destroy your only copy. You can automate the dump with cron and copy it to Azure Blob Storage or your computer.

---

## 18. Security checklist

- `.env` is present on the VM only, with permissions `600`.
- `.env` is not committed to GitHub.
- SSH uses a key, not a password.
- Azure NSG allows only 22, 80, and 443.
- Postgres and Redis do not publish ports to the host.
- Database, Redis, and JWT secrets are long and random.
- GitHub Pages contains only public values. The frontend must never contain Groq, Cloudinary, or database secrets.
- Caddy provides HTTPS. The API URL must start with `https://`.
- Keep Docker images updated with `docker compose -f docker-compose.prod.yml pull`.

---

## 19. Cost control

- A B2s VM running continuously can use roughly 30 USD per month or more, depending on region and disk.
- The 100 USD student credit may last only a few months if the VM runs all the time.
- Stop and deallocate the VM when you are not using it.
- Set Azure budget alerts.
- Do not create Azure Database for PostgreSQL for this project. It does not include ParadeDB `pg_search`, and it adds cost.
- Cloudinary and Groq remain external services on their own free tiers.

---

## 20. Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| `502 Bad Gateway` from Caddy | API container is not running | `docker compose logs api` |
| Browser CORS error | Origin missing or wrong | Add exact `https://USERNAME.github.io` to `CORS_ORIGINS`; restart API |
| Mixed content error | Frontend calls `http://` API | Set `VITE_API_URL` to `https://...` |
| `password authentication failed` | Bad `DATABASE_URL` or encoding | Check user, password, database name, and URL-encoding |
| API cannot connect to Postgres | Wrong hostname | Use `paradedb`, not `localhost` |
| Redis connection refused | Wrong host or password | Use `redis`, port `6379`, username `default` |
| `extension "vector" does not exist` | Extensions not created | Run the `CREATE EXTENSION` commands |
| BM25 query fails | Missing `pg_search` or index | Check `\dx` and `\d document_chunks` |
| GitHub Pages 404 on refresh | Missing `404.html` or wrong `base` | Copy `index.html` to `404.html`; fix Vite `base` |
| Docker build killed | VM has too little RAM | Use B2ms temporarily or build the image elsewhere |
| Disk full | Old Docker images | `docker system prune -af` and check disk usage |
| HTTPS certificate fails | DNS not pointing to VM | Check the `A` record and Caddy logs |

---

## 21. Quick deployment order

1. Fix CORS in `app/main.py`.
2. Fix frontend API URL and Vite base path.
3. Create the Ubuntu VM.
4. Install Docker.
5. Point the API domain to the VM.
6. Clone the project.
7. Create `.env`.
8. Create `docker-compose.prod.yml`.
9. Create `Caddyfile`.
10. Start `paradedb` and `redis`.
11. Create extensions.
12. Run `init_db`.
13. Create search indexes.
14. Start the full stack.
15. Deploy the frontend with GitHub Actions.
16. Test signup, login, upload, and chat.
17. Set up backups and budget alerts.

---

## 22. Important project-specific notes

- The current `docker-compose.yml` is not the Azure production file. It expects an external `rag-net` network and a container named `paradedb-rag-clean`.
- `app/db/init_db.py` creates tables only. Extensions must be enabled first.
- `pdb.score()` and the `|||` operator require the ParadeDB `pg_search` extension and a BM25/ParadeDB index.
- `<=>` requires the `vector` extension. An HNSW index is recommended but not required for correctness.
- Local `uploads/` files are temporary processing files. PDFs are stored in Cloudinary, but the Docker volume still keeps uploads across restarts.
- The backend currently runs a single Uvicorn process. This is fine for a student project and avoids loading the embedding model multiple times.
- The API has no dedicated `/health` endpoint. Use `/docs` to verify it is reachable.
