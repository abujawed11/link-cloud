# Running Link Cloud locally (Windows)

## Prerequisites

- Docker Desktop (running)
- MySQL running on your Windows host (not in Docker) and listening on `localhost:3306`
- Node.js (for the frontend)

## 1. Configure environment

In `backend/.env`, make sure these are set (adjust password/secret as needed):

```
DB_HOST=localhost
DB_USER=link_cloud_user
DB_PASSWORD=<your mysql password>
DB_NAME=link_cloud

REDIS_HOST=127.0.0.1
REDIS_PASSWORD=dev-redis-pass

JWT_SECRET=<a long random string>
```

(`docker-compose.windows.yml` overrides `REDIS_HOST` to `redis` and `DB_HOST` to
`host.docker.internal` automatically for the containers — you don't need to change those in
`.env` for Docker to work. `docker-compose.yml`, without the `.windows` suffix, is the Linux/VPS
config using `network_mode: host` — don't use it here, Docker Desktop on Windows doesn't support
that the way a real Linux host does.)

Also add this line so the cookie set on login works over plain `http://localhost` (see
`config/env.js` - a `Secure` cookie is silently dropped by non-browser HTTP clients, and even
your own browser's `fetch` calls, once `NODE_ENV=production` is forced in the container):

```
COOKIE_SECURE=false
```

## 2. Prepare the database (first time only)

Make sure the `link_cloud` database and user exist in your local MySQL, then from `backend/`:

```
npm install
npm run db:init
npm run db:migrate
npm run db:seed-admin
```

## 3. Start Redis + API + worker with Docker

From `backend/`:

```
docker compose -f docker-compose.windows.yml up -d --build
```

Check everything is up:

```
docker compose -f docker-compose.windows.yml ps
docker compose -f docker-compose.windows.yml logs -f api
```

You should see `API listening on http://0.0.0.0:4000` in the `api` logs.

To stop everything:

```
docker compose -f docker-compose.windows.yml down
```

## 4. Start the frontend

From `frontend/`:

```
npm install
npm run dev
```

Open the URL Vite prints (e.g. `http://localhost:5173`). It proxies `/api/*` requests to the
backend on port 4000.

## Troubleshooting

- **`ECONNREFUSED 127.0.0.1:6379`** — Redis container isn't reachable; run
  `docker compose -f docker-compose.windows.yml ps` to confirm `link-cloud-redis` is `Up`.
- **`socket hang up` on `/api/...` in the Vite logs** — the API container isn't accepting
  connections on its mapped port. Check `docker compose -f docker-compose.windows.yml logs api`
  for the "API listening on" line — it must say `0.0.0.0`, not `127.0.0.1`.
- **Container name already in use** — an old container from a previous run is still around:
  `docker rm -f link-cloud-redis` (or whichever name conflicts), then
  `docker compose -f docker-compose.windows.yml up -d` again.
- **API can't reach MySQL** — MySQL on Windows must accept connections from Docker's internal
  network, not just `127.0.0.1`. Check MySQL's `bind-address` setting.
