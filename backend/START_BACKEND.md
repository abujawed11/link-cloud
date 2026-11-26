# Starting the backend (Windows)

A checklist to follow every time. Part A is only for a **new machine**. Part B is for
**every time you pull new code or restart your PC**.

> **Rule #1 on Windows:** always use `-f docker-compose.windows.yml`.
> Plain `docker compose up` uses `docker-compose.yml`, which is the Linux/VPS config
> (`network_mode: host`). On Docker Desktop for Windows that starts the containers but
> port 4000 is never reachable, so the frontend shows **`Request failed (502)`** and
> Vite logs **`http proxy error ... ECONNREFUSED`**.

---

## Part A - New machine (one time only)

### A1. Install

- Docker Desktop (and start it)
- MySQL Server running on Windows, port `3306` (not in Docker)
- Node.js (LTS)

### A2. Create the database and user

In MySQL Workbench (change the password):

```sql
CREATE DATABASE IF NOT EXISTS link_cloud CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'link_cloud_user'@'localhost' IDENTIFIED BY 'ChangeThisStrongPassword!';
GRANT ALL PRIVILEGES ON link_cloud.* TO 'link_cloud_user'@'localhost';
FLUSH PRIVILEGES;
```

The API container connects from Docker's network (`host.docker.internal`), not from
`localhost`. If the API logs MySQL access-denied or connection errors, also create the
user for `'%'` and make sure MySQL's `bind-address` isn't `127.0.0.1` only:

```sql
CREATE USER IF NOT EXISTS 'link_cloud_user'@'%' IDENTIFIED BY 'ChangeThisStrongPassword!';
GRANT ALL PRIVILEGES ON link_cloud.* TO 'link_cloud_user'@'%';
FLUSH PRIVILEGES;
```

### A3. Create `backend/.env`

`.env` is not in git, so you have to create it on each machine:

```
cd backend
copy .env.example .env
```

Then edit `.env` and set at least these:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=link_cloud_user
DB_PASSWORD=ChangeThisStrongPassword!
DB_NAME=link_cloud

JWT_SECRET=<long random string>
REDIS_PASSWORD=dev-redis-pass
COOKIE_SECURE=false
```

- Generate `JWT_SECRET` with:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `COOKIE_SECURE=false` is needed because the container runs with `NODE_ENV=production`
  over plain `http://localhost`.
- Leave `DB_HOST=localhost` and `REDIS_HOST=127.0.0.1` as they are.
  `docker-compose.windows.yml` overrides them for the containers automatically.
- If a password contains `#` or `$`, wrap it in quotes: `DB_PASSWORD="my#pass"`.

### A4. Create the tables and the admin user

From `backend/`:

```
npm install
npm run db:init
npm run db:seed-admin -- admin@example.com "StrongPassword123"
```

`db:init` creates the tables from `schema.sql` and marks all existing migrations as applied.

Then continue with Part B.

---

## Part B - Every time (after `git pull`, or after a restart)

### B1. Make sure these are running

- Docker Desktop (whale icon says "Engine running")
- MySQL service (Windows Services -> `MySQL80`, or similar, is "Running")

### B2. Update dependencies and the database

From `backend/`:

```
npm install
npm run db:migrate
```

`db:migrate` is safe to run every time. It only applies new files in
`src/db/migrations/` and prints `Already up to date.` if there's nothing to do.
**If you skip this after a pull**, you get errors like
`Unknown column 'partial_stored_name' in 'field list'`.

Also check whether `.env.example` changed in the pull (`git diff HEAD@{1} -- .env.example`).
If new keys were added, copy them into your `.env`.

### B3. Start Redis + API + worker

From `backend/`:

```
docker compose -f docker-compose.windows.yml up -d --build
```

`--build` rebuilds the image so the containers run the code you just pulled.

### B4. Check it's working

```
docker compose -f docker-compose.windows.yml ps
docker compose -f docker-compose.windows.yml logs --tail 20 api
curl http://localhost:4000/api/auth/status
```

What you should see:

- `ps`: `link-cloud-api` has `0.0.0.0:4000->4000/tcp` in its PORTS column.
  **If PORTS is empty, you started it with the wrong compose file. See Troubleshooting.**
- `logs`: `API listening on http://0.0.0.0:4000`, with no MySQL or Redis errors after it.
- `curl`: a JSON response (status 200).

### B5. Start the frontend

From `frontend/` (in a second terminal):

```
npm install
npm run dev
```

Open `http://localhost:5173`. Vite forwards `/api/*` to `http://localhost:4000`.

---

## Stopping

```
docker compose -f docker-compose.windows.yml down
```

---

## Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| `502 Bad Gateway` in the browser, `ECONNREFUSED` in Vite logs, empty PORTS in `docker ps` | Started with `docker-compose.yml` (host mode). Run `docker compose down`, then `docker compose -f docker-compose.windows.yml up -d --build`. |
| `502` and `docker ps` shows no `link-cloud-api` | Docker Desktop isn't running, or the container crashed. Check `docker compose -f docker-compose.windows.yml logs api`. |
| API log says `listening on http://127.0.0.1:4000` | Wrong compose file again. The Windows file sets `HOST=0.0.0.0`. |
| `Unknown column ...` / `Table ... doesn't exist` | Run `npm run db:migrate` (or `npm run db:init` on a fresh DB). |
| `ECONNREFUSED ...:3306` / `Access denied for user` | MySQL isn't running, or the user isn't allowed to connect from Docker. See A2. |
| `REDIS_PASSWORD variable is not set` warning | Add `REDIS_PASSWORD=...` to `backend/.env`, then run `up -d` again. |
| `Container name "/link-cloud-..." is already in use` | `docker rm -f link-cloud-api link-cloud-worker link-cloud-redis`, then start again. |
| Login succeeds but you're immediately logged out | `COOKIE_SECURE=false` is missing from `.env`. |

More detail: `DATABASE.md`, `SEED_ADMIN.md`, `RUNNING_LOCALLY.md`.
