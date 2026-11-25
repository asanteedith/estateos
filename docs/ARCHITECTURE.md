# Architecture

## Shape

A modular monolith: one Next.js (App Router) application, one PostgreSQL database, business logic in plain TypeScript modules that the pages call through server actions. Modules do not reach into each other's tables except through exported functions, so any module can later be split out.

```
src/
  db/
    schema.ts        All tables (Drizzle ORM). Migrations are generated into /drizzle.
    client.ts        Postgres (DATABASE_URL) in production, embedded PGlite locally and in tests.
  modules/
    tenancy/         TenantContext, role and HQ checks.
    auth/            Password hashing (scrypt), sign-up, login, sessions, HQ bootstrap.
    crm/             Prospects, dedupe, evidence-based scoring, pipeline stages.
    outreach/        Email/WhatsApp message log, duplicate guards, meetings.
    commercial/      Pricing policy and proposals.
    billing/         Invoices, verified payments, expenses.
    ops/             Agent roles, task queue, approvals, objectives, activity log.
    listings/        Agency product: listings, public page, enquiries.
    dashboard/       Command Centre metrics (counted from records only).
  lib/               Session cookie, server action helper, rate limiter.
  app/               Pages. /app/* is signed-in; /p/[slug] is the public agency page.
tests/               Vitest suites against an in-memory database.
```

## Tenancy

- A **tenant** is a workspace. `kind = 'hq'` is EstateOS's own business; `kind = 'agency'` is a customer.
- Every service function takes a `TenantContext` built from the session, never from request input, and filters every query by `ctx.tenantId`.
- Every tenant table has `UNIQUE (tenant_id, id)`, and child tables reference parents with composite foreign keys `(tenant_id, parent_id)`. The database therefore rejects any row that points at another tenant's data, even if application code has a bug. `tests/tenant-isolation.test.ts` checks both layers.
- Command Centre modules call `requireHq(ctx)`. HQ pages also redirect agency users.
- The only cross-tenant read is the count of agency workspaces on the HQ dashboard.

## Roles

`owner`, `admin`, `member`. Only owners decide approvals. Admins and owners record payments, void invoices and record expenses.

## Money

- Stored as integer minor units with a currency (`GHS` or `USD`). No floats.
- Pricing policy lives in `src/modules/commercial/pricing.ts`. A proposal below list price or with a smaller deposit is created as `pending_approval` and cannot be marked sent until the owner approves the price exception.
- An invoice's status is derived from verified payments. A payment needs an admin, a transaction reference (unique per method), a written description of the evidence checked, a matching currency, and an amount no larger than the balance. The database also enforces non-empty reference and evidence.
- Expenses need an approved `spend` approval of at least the same amount and currency.

## Pipeline stages

`new → contacted → replied → meeting → proposal → negotiation → won / lost`. Recording an outbound message, a reply, a meeting, a sent proposal, an accepted proposal and a fully paid deposit move a prospect forward automatically. Automatic moves never go backwards or out of `won`/`lost`. Manual stage changes are allowed and logged.

## Security notes

- Passwords: scrypt (N=16384, r=8, p=1) with a random salt. Login compares against a dummy hash for unknown emails so timing does not reveal accounts.
- Sessions: 32 random bytes in an httpOnly, SameSite=Lax cookie (Secure in production). Only a SHA-256 of the token is stored.
- Server actions are protected by Next.js origin checks. Security headers are set in `next.config.ts`.
- Login, sign-up and public enquiries are rate limited in memory per instance (see the risk register).
