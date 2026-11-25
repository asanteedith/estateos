# Deploying EstateOS

Nothing is deployed yet. These steps need the founder's go-ahead because they put the app on the public internet.

## Free-tier setup (no cost)

1. **Database.** Create a free Postgres on Neon (neon.tech) or Supabase. Copy the connection string.
2. **Migrate and bootstrap.** Either set `SETUP_TOKEN` (a random string of 24+ characters) in Vercel and open `/setup?token=<SETUP_TOKEN>` once after deploying (it creates the tables, the HQ workspace and the founder login, then stops working), or run from your computer:
   ```bash
   DATABASE_URL="postgres://..." pnpm db:migrate
   DATABASE_URL="postgres://..." FOUNDER_NAME="..." FOUNDER_EMAIL="..." FOUNDER_PASSWORD="..." pnpm db:bootstrap
   ```
3. **Vercel.** Import the GitHub repository in Vercel, framework Next.js, and set the environment variable `DATABASE_URL`. For Neon or Supabase use the pooled connection string.
4. Open `/api/health`. It returns `{"ok":true,"db":"up"}` when the database is reachable.

## Before charging customers

Vercel's Hobby plan is for personal, non-commercial projects. Once EstateOS takes payments, it should move to Vercel Pro or another host. That is a cost and needs founder approval.

## Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Production | Postgres connection string |
| `DATABASE_POOL_MAX` | No | Connections per instance (default 5) |
| `SETUP_TOKEN` | First run only | Enables the one-time `/setup` page; remove it after setup |
| `ALLOW_EMBEDDED_DB` | No | Lets `next start` use the embedded database (local testing only) |
| `FOUNDER_NAME`, `FOUNDER_EMAIL`, `FOUNDER_PASSWORD` | Bootstrap only | Used once by `pnpm db:bootstrap`; do not set them in Vercel |

## Database security on Supabase

Migration `0001_enable_rls` turns on row-level security with no policies on every table. Supabase's public data API (anon and authenticated roles) therefore cannot read or write EstateOS tables. The app connects as the table owner, which bypasses RLS.
