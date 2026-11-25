# EstateOS

EstateOS is two things in one codebase:

1. **The product for real estate agencies.** Each agency gets a private workspace to manage property listings, a public listings page at `/p/<agency-slug>` with an enquiry form, and an enquiries inbox.
2. **The EstateOS Business Command Centre.** The founder's own workspace ("HQ") for running the business: prospects, sales pipeline, outreach log, meetings, proposals, invoices and verified payments, expenses, approvals, agent roles and their task queue, objectives and an activity log.

It is a modular monolith on Next.js and PostgreSQL that runs on Vercel's free tier with a free Postgres (Neon, Supabase or Vercel Postgres).

## Status: what exists and what does not

Built, tested and clicked through in a browser:

- Agency sign-up, login, logout, 14-day sessions (hashed tokens, httpOnly cookie), per-request membership check.
- Tenant isolation in the services and in the database (composite foreign keys), with tests.
- Listings (draft, published, archived), public agency page, enquiry form with honeypot and rate limit, enquiries inbox.
- Command Centre dashboard with counts taken only from stored records. A fresh install shows zeros.
- Prospects with evidence-based fit scoring, source links, verification status and duplicate prevention.
- Outreach log for email and WhatsApp with duplicate guards (same message id never stored twice; no second outbound to the same prospect within 48 hours unless marked as a follow-up).
- Meetings, proposals with the pricing policy (Ghana GH₵1,500, international US$750, 50% deposit), founder approval for anything below policy, deposit invoice raised on acceptance.
- Invoices and payments. An invoice can only become paid through a payment recorded by an admin with a transaction reference and a description of the evidence checked. Paid deposit marks the customer as won.
- Expenses that can only be recorded against an approved spend.
- Nine agent roles with a task queue, honestly marked "manual".

Not built yet (do not promise these to customers):

- Sending email or WhatsApp from the app. Messages are sent from Gmail or WhatsApp and then recorded here.
- Automatic Gmail sync, calendar sync, payment provider webhooks (Paystack, Stripe, MoMo).
- Photo uploads for listings, custom domains for agency pages, team invitations, password reset.
- Agents that run on their own. The roles and queue exist; the work is done by people or Claude sessions.

## Run it locally

Requires Node 22 and pnpm.

```bash
pnpm install
FOUNDER_NAME="Your Name" FOUNDER_EMAIL="you@example.com" FOUNDER_PASSWORD="choose-a-long-one" pnpm db:bootstrap
pnpm dev
```

Without `DATABASE_URL` the app uses an embedded PostgreSQL (PGlite) stored in `./.data/pglite`. Stop the dev server before running `db:bootstrap` again, as only one process can open that folder.

Open http://localhost:3000/login and sign in as the founder to reach the Command Centre. Use http://localhost:3000/signup to create an agency workspace.

## Tests

```bash
pnpm test        # 41 tests: auth, tenant isolation, pricing, approvals, invoices and payments
pnpm typecheck
pnpm build
```

Tests run against an in-memory PostgreSQL, so they need no setup.

## Deploy

See [docs/DEPLOY.md](docs/DEPLOY.md). Nothing has been deployed yet: deploying needs the founder's go-ahead.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): modules, data model, tenancy and money rules.
- [docs/OPERATIONS.md](docs/OPERATIONS.md): how the nine agent roles work day to day, and which integrations are real.
- [docs/RISK_REGISTER.md](docs/RISK_REGISTER.md): security and quality risks and their status.
- [docs/DEPLOY.md](docs/DEPLOY.md): free-tier deployment on Vercel with Neon.
