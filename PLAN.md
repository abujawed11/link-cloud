# Link Cloud: Project Plan

A web app where you paste a direct download URL and click **Download**. The file is downloaded **by the VPS** (not your local machine), stored on the server, and can be downloaded again any time from a file list.

> **How to use this file:** It is a living document. Tick checkboxes (`[x]`) as tasks finish, update the **Status** line of each phase, and add notes in the **Decision Log** and **Changelog** at the bottom. Anyone (human or AI) picking up the project should read this file first.

---

## 1. Goals

- Paste a URL, the server fetches the file and stores it on the VPS disk.
- Large files are **streamed** to disk (no loading into RAM).
- See job progress (queued, downloading, done, failed).
- Browse stored files and download or delete them at any time.
- Protected by login, so it cannot be abused as an open proxy.
- Later: job queue with Redis + BullMQ (retries, concurrency, cancel, resume).

## 2. Non-Goals (for now)

- Sites that need a browser or login, such as Google Drive share pages, YouTube, and Mega. These would need `yt-dlp` or similar, and have legal and terms-of-service concerns. Postponed until the core works.
- Torrent or magnet links.
- Public file sharing or public links.
- Multi-server or cloud storage (S3). Local VPS disk only.

## 3. Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React (Vite) |
| Backend | Node.js + Express |
| Database | MySQL |
| Auth | JWT or sessions, bcrypt for passwords |
| Download | Node streams (`fetch` or `undici` or `axios` with `responseType: stream`) |
| Queue (Phase 3) | Redis + BullMQ |
| Progress (Phase 2) | Server-Sent Events (or polling) |
| Deployment | VPS + Nginx (reverse proxy, HTTPS) + PM2 |

## 4. Architecture

```
Browser (React)
   |  HTTPS
   v
Nginx  --serves-->  React build (static)
   |  /api proxy
   v
Express API  --reads/writes-->  MySQL (users, jobs, files)
   |
   |-- Phase 1-2: downloadService runs in-process
   |-- Phase 3:   API pushes job to BullMQ (Redis)
   |                    |
   |                    v
   |              Worker process (PM2)  -->  streams URL to disk
   v
Disk: /var/link-cloud/files   (outside web root, never served statically)
```

### Key design principles

1. **MySQL is the source of truth.** Users, files, and job history live in MySQL. BullMQ only runs work.
2. **Queue-ready from day one.** Download logic lives in its own module (`downloadService.start(jobId)`). Controllers only create a job row and call the service. In Phase 3, that call is replaced with `queue.add()`.
3. **Files are never served statically.** Downloads go through an authenticated route that streams the file.
4. **API and worker are separable.** In Phase 3 they become two PM2 processes.

## 5. Folder Structure (target)

```
link-cloud/
  PLAN.md
  frontend/                # React + Vite
    src/
      pages/               # Login, Dashboard, Files
      components/          # UrlForm, JobList, FileList, ProgressBar
      api/                 # fetch wrappers
  backend/
    src/
      config/              # env, db connection
      db/                  # schema.sql, migrations
      middleware/          # auth, error handler, rate limit
      routes/              # auth, jobs, files
      controllers/
      services/
        downloadService.js # streaming download logic (queue-agnostic)
        ssrfGuard.js       # URL validation (Phase 2)
        storageService.js  # paths, free space, filename sanitising
      workers/             # BullMQ worker (Phase 3)
      queues/              # BullMQ queue defs (Phase 3)
    .env.example
```

## 6. Data Model (MySQL)

**users**
- `id`, `email` (unique), `password_hash`, `role`, `created_at`

**files**
- `id`, `user_id`, `original_name`, `stored_name` (random, safe), `size_bytes`, `mime_type`, `source_url`, `created_at`

**jobs**
- `id`, `user_id`, `url`, `status` (`queued` | `downloading` | `done` | `failed` | `cancelled`), `progress` (0-100), `bytes_downloaded`, `bytes_total`, `error`, `file_id` (nullable), `created_at`, `updated_at`

## 7. API Design (draft)

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create user (can be disabled for single-user mode) |
| POST | `/api/auth/login` | Log in, returns token or cookie |
| POST | `/api/auth/logout` | Log out |
| POST | `/api/jobs` | Submit URL, create job and start download |
| GET | `/api/jobs` | List my jobs |
| GET | `/api/jobs/:id` | Job status and progress |
| GET | `/api/jobs/:id/events` | SSE progress stream (Phase 2) |
| POST | `/api/jobs/:id/cancel` | Cancel job (Phase 3) |
| POST | `/api/jobs/:id/retry` | Retry failed job (Phase 3) |
| GET | `/api/files` | List my files |
| GET | `/api/files/:id/download` | Stream file to the browser (auth required) |
| DELETE | `/api/files/:id` | Delete file from disk and DB |

## 8. Security Checklist

- [ ] Authentication on **all** routes except login (and register if enabled)
- [ ] Passwords hashed with bcrypt
- [ ] **SSRF protection:** only `http`/`https`; resolve DNS and block private, loopback, link-local, and metadata IPs (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`, etc.); re-check on every redirect
- [ ] Max file size limit (enforced via `Content-Length` **and** while streaming)
- [ ] Check free disk space before and during download
- [ ] Download timeout and max redirects
- [ ] Sanitise filenames (strip path separators, `..`, control chars); store under a random `stored_name`
- [ ] Files stored outside web root; served only via authenticated route
- [ ] Per-user quota (total storage) and max concurrent downloads
- [ ] Rate limiting on login and job-creation endpoints
- [ ] Helmet, CORS locked to own origin, HTTPS only in production
- [ ] Secrets in `.env`, never committed

## 9. Phases

### Phase 0: Setup and Foundations
**Status:** Done (MySQL not yet connected locally; see notes)

- [x] Create `frontend/` (Vite + React) and `backend/` (Express) folders
- [x] `.env.example`, `.gitignore`, ESLint/Prettier (optional)
- [x] MySQL connection config (`mysql2` pool)
- [x] `schema.sql` for `users`, `files`, `jobs`
- [x] Health-check route `GET /api/health`
- [x] Central error handler and request logging

**Phase 0 notes:**
- Backend: `cd backend && npm run dev` (port 4000). `npm run db:init` creates the DB and tables from `src/db/schema.sql` (needs MySQL running and credentials in `backend/.env`, copied from `.env.example`).
- Frontend: `cd frontend && npm run dev` (port 5173). Vite proxies `/api` to `localhost:4000`. The page shows API and DB health.
- Linting uses oxlint (from the Vite template); Prettier not added.
- Verified: API starts, `/api/health` returns 200 (`db: down` until MySQL is configured), 404 handler works, frontend builds.

### Phase 1: Core MVP (login, download, store, list, re-download)
**Status:** Done (verified via API tests; UI not yet clicked through in a browser)

Backend
- [x] Auth: register/login with bcrypt + JWT (or session cookie); auth middleware
- [x] `storageService`: storage dir config, safe filename, random stored name
- [x] `downloadService.start(jobId)`: stream URL to disk, update job row, create `files` row on success, clean up partial file on failure
- [x] `POST /api/jobs` creates job row and kicks off download (fire-and-forget in-process)
- [x] `GET /api/jobs`, `GET /api/jobs/:id`
- [x] `GET /api/files`, `GET /api/files/:id/download` (streamed, authenticated), `DELETE /api/files/:id`

Frontend
- [x] Login page
- [x] Dashboard: URL input and Download button
- [x] Jobs list with status (polling every 2-3 s is fine for now)
- [x] Files list with Download and Delete buttons
- [x] Basic error and empty states

**Done when:** you can log in, paste a direct file URL, see it finish, then download it again from the list.

**Phase 1 notes:**
- Auth: JWT in an httpOnly cookie (7 days). Registration is open only while no user exists (first user becomes `admin`); set `ALLOW_REGISTRATION=true` in `backend/.env` to allow more sign-ups. `JWT_SECRET` is required (server refuses to start with the placeholder).
- `downloadService.start(jobId)` uses Node's built-in `fetch`, streams to `STORAGE_DIR/<uuid>`, writes progress at most once per second, and deletes partial files on failure. `jobController.create` calls it fire-and-forget (Phase 3: swap for `queue.add()`).
- Frontend polls `/api/jobs` every 2.5 s; the file list refreshes when a job finishes.
- Tested with curl against a local test file: register, login, bad login, unauthenticated access (401), bad URL, successful download (byte-identical), remote 404 recorded as `failed`, authenticated download, delete (file removed from disk), logout. Test user and data were removed afterwards.
- **Known gaps (all Phase 2):** no SSRF protection (a logged-in user can make the server fetch internal URLs), no size/disk/timeouts limits, no rate limiting, jobs stuck in `downloading` if the server restarts mid-download.

### Phase 2: Hardening and Live Progress
**Status:** Not started

- [ ] Real progress: `bytes_downloaded` / `bytes_total`, speed, ETA
- [ ] SSE endpoint (or keep polling) for live progress in the UI
- [ ] `ssrfGuard` (see Security Checklist)
- [ ] Max file size, free-disk check, timeouts, max redirects
- [ ] Per-user storage quota and max concurrent downloads
- [ ] Rate limiting, Helmet, CORS
- [ ] Better filename detection (`Content-Disposition`, URL, MIME type)
- [ ] Download resume support where server supports `Range` (optional)
- [ ] Restart recovery: on server start, mark orphaned `downloading` jobs as `failed`

### Phase 3: Redis + BullMQ Job Management
**Status:** Not started

- [ ] Install and configure Redis on VPS (bind to localhost, set password)
- [ ] `queues/downloadQueue.js` (BullMQ queue)
- [ ] `workers/downloadWorker.js` as a **separate process** calling `downloadService`
- [ ] Replace in-process call in `POST /api/jobs` with `queue.add()`
- [ ] Concurrency limit (global and per user)
- [ ] Retries with exponential backoff for transient failures
- [ ] Cancel and retry endpoints and UI buttons
- [ ] Progress reporting through BullMQ events and DB updates
- [ ] Optional: Bull Board dashboard (admin only)
- [ ] PM2 ecosystem file running `api` and `worker`

### Phase 4: Deployment on VPS
**Status:** Not started

- [ ] Provision VPS (Ubuntu), create non-root user, firewall (ufw: 22, 80, 443 only)
- [ ] Install Node, MySQL, (Redis if Phase 3 done), Nginx, PM2
- [ ] Create `/var/link-cloud/files` with correct permissions
- [ ] Build React, serve via Nginx; proxy `/api` to Express
- [ ] Nginx: raise `client_max_body_size` if needed, disable proxy buffering for file downloads and SSE
- [ ] Domain + HTTPS (Let's Encrypt / certbot)
- [ ] PM2 startup on boot; log rotation
- [ ] DB and file backup strategy

### Phase 5: Nice-to-Haves (backlog)
**Status:** Not started

- [ ] Folders / tags / search for files
- [ ] Bulk URL paste (multiple links at once)
- [ ] Scheduled auto-delete of old files
- [ ] Storage usage dashboard
- [ ] Checksum (SHA-256) display and verification
- [ ] Notifications (email or webhook) when a job completes
- [ ] `yt-dlp` integration for supported sites (review legal and ToS first)
- [ ] Admin panel for users, quotas, and logs
- [ ] Temporary share links with expiry

## 10. Open Questions

- Single-user (just you) or multi-user signup? *(Affects register endpoint, quotas, and the `users` table usage.)*
- Auth style: JWT in header vs. httpOnly cookie session?
- Max file size and total storage quota?
- Is MySQL already installed locally for development?
- VPS specs (disk size, RAM) and OS?

## 11. Decision Log

| Date | Decision | Reason |
|---|---|---|
| 2026-11-08 | Stack: React + Express + Node + MySQL; Redis + BullMQ later | User preference; BullMQ suits download jobs |
| 2026-11-08 | Download logic isolated in `downloadService` | Makes Phase 3 BullMQ migration a small change |
| 2026-11-08 | Files served only through authenticated route | Prevents public access and abuse |
| 2026-11-08 | Folders named `frontend/` and `backend/` (user created them) | Plan updated to match |
| 2026-11-08 | Single-user default: registration closes after first account; JWT in httpOnly cookie | Open questions unanswered, safest defaults; easy to change |
| 2026-11-08 | `yt-dlp` / site-specific downloaders out of scope for MVP | Legal/ToS risk and extra complexity |

## 12. Changelog

| Date | Who | Change |
|---|---|---|
| 2026-11-08 | Claude | Created initial plan (no code written yet) |
| 2026-11-08 | Claude | Phase 1 done: auth, download service, jobs/files API, React login/dashboard |
| 2026-11-08 | Claude | Phase 0 done: Express scaffold (config, db pool, schema.sql, health route, error handler), Vite proxy, status page |
