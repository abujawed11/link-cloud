# Create / Reset the Admin Account (Seed Script)

Use this on a **new PC or a new server** to create the first admin account, or to reset a forgotten password. The script is `src/db/seedAdmin.js`.

## Before you start

1. The database exists and the tables are created (see `DATABASE.md`, steps 1 to 3).
2. `backend/.env` has the correct `DB_*` values for **this** machine.
3. Dependencies are installed: run `npm install` in `backend/`.

## Create the admin

Run from the `backend/` folder:

```
npm run db:seed-admin -- admin@example.com "StrongPassword123"
```

Expected output:

```
Created admin user admin@example.com.
```

Then open the app and log in with that email and password.

## Rules

- Password must be **at least 8 characters**.
- Email must be valid. It is stored in lowercase.
- Passwords are hashed with bcrypt; the plain password is never stored.
- The script is safe to re-run.

## Reset a forgotten password

Run the same command with the **same email** and a new password:

```
npm run db:seed-admin -- admin@example.com "NewPassword456"
```

Expected output:

```
Updated existing user admin@example.com: password reset, role set to admin.
```

This also promotes that user to `admin` if they were a normal user.

## Using environment variables instead

Useful for scripts or deployments, so the password doesn't appear in the command line:

**Linux / macOS (VPS):**
```
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='StrongPassword123' npm run db:seed-admin
```

**Windows PowerShell:**
```
$env:ADMIN_EMAIL="admin@example.com"; $env:ADMIN_PASSWORD="StrongPassword123"; npm run db:seed-admin
```

## Quoting tips

- Always wrap the password in quotes.
- On Linux, use **single quotes** if it contains `$`, `!`, or `#`: `'Pa$$w0rd!'`.
- On PowerShell, use single quotes if it contains `$`.
- On Linux, a command starting with a space is not saved in shell history in many setups, which helps keep passwords out of it.

## Registration behaviour

- The sign-up form is open **only until the first user exists**. After that it closes automatically.
- To allow more sign-ups, set `ALLOW_REGISTRATION=true` in `backend/.env` and restart the API.

## Troubleshooting

| Problem | Fix |
|---|---|
| `Usage: npm run db:seed-admin -- <email> <password...>` | Email invalid or password under 8 characters. Check the arguments. |
| `Seed failed: Access denied for user ...` | Wrong `DB_USER` or `DB_PASSWORD` in `.env`. |
| `Seed failed: Unknown database 'link_cloud'` | Create the database first (`DATABASE.md`, step 1). |
| `Seed failed: Table 'link_cloud.users' doesn't exist` | Run `npm run db:init` first. |
| `ECONNREFUSED` | MySQL isn't running, or `DB_HOST` / `DB_PORT` is wrong. |
| Can't log in after seeding | Make sure the app uses the same database as `.env` here, then re-run the script with a new password. |

## Quick checklist for a new server

```
cd backend
npm install
cp .env.example .env        # then edit DB_*, JWT_SECRET
npm run db:init
npm run db:seed-admin -- admin@example.com 'StrongPassword123'
npm start
```

Generate a strong `JWT_SECRET` with:

```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
