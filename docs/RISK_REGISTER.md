# Risk register

| # | Risk | Likelihood | Impact | Status / mitigation |
| --- | --- | --- | --- | --- |
| 1 | Cross-tenant data leak through a missing filter | Low | High | Services filter by `ctx.tenantId`; composite foreign keys reject cross-tenant references; isolation tests. Postgres row-level security not yet enabled (possible next step). |
| 2 | Credential stuffing / password guessing | Medium | High | scrypt hashing, generic error, per-IP and per-email limits. Limits are per server instance on serverless; move to a shared store (e.g. Upstash free tier) before heavy traffic. |
| 3 | No password reset or email verification | High | Medium | Not built. Owners who forget a password need manual help. Build before onboarding more than a few agencies. |
| 4 | Spam through public enquiry forms | Medium | Low | Honeypot field, per-IP rate limit, length limits, email or phone required. |
| 5 | Invoice marked paid without money received | Low | High | Only path is `recordVerifiedPayment` (admin role, reference, evidence, currency and balance checks, DB constraints). |
| 6 | Number generation race (two invoices at once get the same number) | Low | Low | Unique constraint rejects the second insert; the user retries. Replace with a sequence if volume grows. |
| 7 | Embedded PGlite used in production by mistake | Low | High | App refuses to start in production without `DATABASE_URL` unless `ALLOW_EMBEDDED_DB` is set. |
| 8 | Times entered in forms are read as server time | Medium | Low | Server runs in UTC, which equals Ghana time. International users entering local times will be off by their offset. |
| 9 | Overclaiming features in sales material | Medium | High | README and OPERATIONS list what is not built. Landing page lists only what exists. |
| 10 | Dependency licences | Low | Medium | All runtime dependencies are MIT, Apache-2.0, ISC, BSD, 0BSD, Unlicense or CC-BY-4.0 (caniuse data). `sharp`'s optional libvips binary is LGPL-3.0, used unmodified as a dynamic library, which is fine for a hosted service. |
| 11 | Free-tier limits (Vercel Hobby is for non-commercial use) | Medium | Medium | Vercel's Hobby plan terms restrict commercial use. Before charging customers, either move to Vercel Pro (cost: needs approval) or host on another free tier. Flagged for the founder. |
