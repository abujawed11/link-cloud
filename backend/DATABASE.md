# Database Setup (MySQL)

Steps to create the database and a dedicated user for Link Cloud, fill in `.env`, and create the tables.

## 1. Create database and user

Run in MySQL Workbench (new query tab, then run the whole script with the lightning-bolt icon). Change the password first.

```sql
CREATE DATABASE IF NOT EXISTS link_cloud
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'link_cloud_user'@'localhost' IDENTIFIED BY 'ChangeThisStrongPassword!';

GRANT ALL PRIVILEGES ON link_cloud.* TO 'link_cloud_user'@'localhost';

FLUSH PRIVILEGES;
```

The user only has access to the `link_cloud` database, which is safer than using `root`.

## 2. Fill in `backend/.env`

Copy `.env.example` to `.env` if you haven't, then set:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=link_cloud_user
DB_PASSWORD=ChangeThisStrongPassword!
DB_NAME=link_cloud
```

- If the password contains special characters like `#` or `$`, wrap it in quotes: `DB_PASSWORD="my#pass"`.
- Never commit `.env` (it is in `.gitignore`).

## 3. Create the tables

From the `backend/` folder:

```
npm run db:init
```

This runs `src/db/schema.sql`, which creates the `users`, `files`, and `jobs` tables (all `IF NOT EXISTS`, so it is safe to re-run).

**If it fails** with a permission error on the first statement (`CREATE DATABASE`), because the new user has no global `CREATE` privilege, use one of these:
- Open `src/db/schema.sql` in Workbench and run it directly.
- Or delete the first two lines of `schema.sql` (`CREATE DATABASE ...` and `USE link_cloud;`) and run `npm run db:init` again.

## 4. Verify

1. Start the API: `npm run dev`
2. Open `http://localhost:4000/api/health`. You should see `"db":"ok"`.
3. Optional check in Workbench: `USE link_cloud; SHOW TABLES;` should list `files`, `jobs`, and `users`.

## VPS / production notes

- Use a **different, strong password** on the VPS. Never reuse the dev one.
- Keep MySQL bound to `localhost` (the default `bind-address=127.0.0.1`) and do not open port 3306 in the firewall.
- Back up regularly, for example with `mysqldump -u link_cloud_user -p link_cloud > backup.sql`.

## Reset (dev only, deletes all data)

```sql
DROP DATABASE link_cloud;
```

Then repeat step 1 (the `CREATE DATABASE` part) and step 3.
