/**
 * EstateOS database schema (PostgreSQL).
 *
 * Multi-tenancy rules:
 * - Every business table carries `tenant_id`.
 * - Every tenant table has UNIQUE (tenant_id, id) so child tables can use
 *   composite foreign keys (tenant_id, parent_id) -> parent(tenant_id, id).
 *   This makes it impossible, at the database level, for a row in one tenant
 *   to reference a row that belongs to another tenant.
 * - Application services always filter by the tenant in the request context
 *   (see src/modules/tenancy/context.ts).
 *
 * Money is stored as integer minor units (pesewas / cents) with a currency.
 */
import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  jsonb,
  unique,
  foreignKey,
  index,
  check,
  primaryKey,
  date,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const tenantId = () =>
  uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" });

/* ----------------------------- Identity ----------------------------- */

export const tenants = pgTable(
  "tenants",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    /** 'hq' = EstateOS's own business workspace; 'agency' = a customer agency. */
    kind: text("kind", { enum: ["hq", "agency"] }).notNull().default("agency"),
    country: text("country"),
    createdAt: createdAt(),
  },
  (t) => [check("tenants_slug_format", sql`${t.slug} ~ '^[a-z0-9][a-z0-9-]{1,62}$'`)],
);

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    tenantId: tenantId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "admin", "member"] }).notNull().default("member"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.userId] })],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the session token. The raw token only lives in the user's cookie. */
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: tenantId(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/* ------------------------------- CRM -------------------------------- */

export const PROSPECT_STAGES = [
  "new",
  "contacted",
  "replied",
  "meeting",
  "proposal",
  "negotiation",
  "won",
  "lost",
] as const;

export const prospects = pgTable(
  "prospects",
  {
    id: id(),
    tenantId: tenantId(),
    companyName: text("company_name").notNull(),
    website: text("website"),
    country: text("country"),
    city: text("city"),
    segment: text("segment"),
    contactName: text("contact_name"),
    contactRole: text("contact_role"),
    email: text("email"),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    /** Where the business details were found (public page URL). Required for honesty. */
    sourceUrl: text("source_url"),
    sourceNote: text("source_note"),
    verificationStatus: text("verification_status", { enum: ["unverified", "verified", "invalid"] })
      .notNull()
      .default("unverified"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    fitScore: integer("fit_score"),
    scoreReasons: jsonb("score_reasons").$type<string[]>(),
    stage: text("stage", { enum: PROSPECT_STAGES }).notNull().default("new"),
    /** Normalised domain or company name, used to prevent duplicate prospects. */
    dedupeKey: text("dedupe_key").notNull(),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("prospects_tenant_id_uq").on(t.tenantId, t.id),
    unique("prospects_tenant_dedupe_uq").on(t.tenantId, t.dedupeKey),
    index("prospects_tenant_stage_idx").on(t.tenantId, t.stage),
    check("prospects_fit_score_range", sql`${t.fitScore} IS NULL OR (${t.fitScore} BETWEEN 0 AND 100)`),
  ],
);

export const outreach = pgTable(
  "outreach",
  {
    id: id(),
    tenantId: tenantId(),
    prospectId: uuid("prospect_id").notNull(),
    channel: text("channel", { enum: ["email", "whatsapp", "phone", "in_person", "other"] }).notNull(),
    direction: text("direction", { enum: ["outbound", "inbound"] }).notNull(),
    status: text("status", { enum: ["drafted", "sent", "failed", "received"] }).notNull(),
    subject: text("subject"),
    body: text("body"),
    /** e.g. Gmail message id, so a message is never recorded twice. */
    externalRef: text("external_ref"),
    campaign: text("campaign"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("outreach_tenant_id_uq").on(t.tenantId, t.id),
    unique("outreach_tenant_external_ref_uq").on(t.tenantId, t.externalRef),
    foreignKey({ columns: [t.tenantId, t.prospectId], foreignColumns: [prospects.tenantId, prospects.id] }).onDelete(
      "cascade",
    ),
    index("outreach_tenant_prospect_idx").on(t.tenantId, t.prospectId),
  ],
);

export const meetings = pgTable(
  "meetings",
  {
    id: id(),
    tenantId: tenantId(),
    prospectId: uuid("prospect_id").notNull(),
    kind: text("kind", { enum: ["discovery", "demo", "onboarding", "review"] }).notNull().default("demo"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    status: text("status", { enum: ["scheduled", "completed", "cancelled", "no_show"] })
      .notNull()
      .default("scheduled"),
    location: text("location"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("meetings_tenant_id_uq").on(t.tenantId, t.id),
    foreignKey({ columns: [t.tenantId, t.prospectId], foreignColumns: [prospects.tenantId, prospects.id] }).onDelete(
      "cascade",
    ),
  ],
);

/* ---------------------------- Commercial ---------------------------- */

export const CURRENCIES = ["GHS", "USD"] as const;

export const proposals = pgTable(
  "proposals",
  {
    id: id(),
    tenantId: tenantId(),
    prospectId: uuid("prospect_id").notNull(),
    number: text("number").notNull(),
    title: text("title").notNull(),
    currency: text("currency", { enum: CURRENCIES }).notNull(),
    amountMinor: integer("amount_minor").notNull(),
    depositPercent: integer("deposit_percent").notNull().default(50),
    scope: text("scope").notNull(),
    status: text("status", { enum: ["draft", "pending_approval", "sent", "accepted", "rejected", "expired"] })
      .notNull()
      .default("draft"),
    approvalId: uuid("approval_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("proposals_tenant_id_uq").on(t.tenantId, t.id),
    unique("proposals_tenant_number_uq").on(t.tenantId, t.number),
    foreignKey({ columns: [t.tenantId, t.prospectId], foreignColumns: [prospects.tenantId, prospects.id] }),
    check("proposals_amount_positive", sql`${t.amountMinor} > 0`),
    check("proposals_deposit_range", sql`${t.depositPercent} BETWEEN 0 AND 100`),
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    tenantId: tenantId(),
    prospectId: uuid("prospect_id").notNull(),
    proposalId: uuid("proposal_id"),
    number: text("number").notNull(),
    kind: text("kind", { enum: ["deposit", "balance", "subscription", "other"] }).notNull(),
    description: text("description").notNull(),
    currency: text("currency", { enum: CURRENCIES }).notNull(),
    amountMinor: integer("amount_minor").notNull(),
    /** Derived from verified payments only. Never set to 'paid' directly. */
    status: text("status", { enum: ["draft", "issued", "partially_paid", "paid", "void"] })
      .notNull()
      .default("draft"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique("invoices_tenant_id_uq").on(t.tenantId, t.id),
    unique("invoices_tenant_number_uq").on(t.tenantId, t.number),
    foreignKey({ columns: [t.tenantId, t.prospectId], foreignColumns: [prospects.tenantId, prospects.id] }),
    foreignKey({ columns: [t.tenantId, t.proposalId], foreignColumns: [proposals.tenantId, proposals.id] }),
    check("invoices_amount_positive", sql`${t.amountMinor} > 0`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    tenantId: tenantId(),
    invoiceId: uuid("invoice_id").notNull(),
    currency: text("currency", { enum: CURRENCIES }).notNull(),
    amountMinor: integer("amount_minor").notNull(),
    method: text("method", { enum: ["mobile_money", "bank_transfer", "card", "cash", "other"] }).notNull(),
    /** Provider transaction reference (MoMo ID, bank ref, Stripe charge id...). */
    reference: text("reference").notNull(),
    /** What a human checked to confirm the money arrived (statement line, screenshot link, provider dashboard). */
    evidence: text("evidence").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    verifiedByUserId: uuid("verified_by_user_id")
      .notNull()
      .references(() => users.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("payments_tenant_id_uq").on(t.tenantId, t.id),
    unique("payments_tenant_reference_uq").on(t.tenantId, t.method, t.reference),
    foreignKey({ columns: [t.tenantId, t.invoiceId], foreignColumns: [invoices.tenantId, invoices.id] }),
    check("payments_amount_positive", sql`${t.amountMinor} > 0`),
    check("payments_reference_present", sql`length(trim(${t.reference})) >= 3`),
    check("payments_evidence_present", sql`length(trim(${t.evidence})) >= 10`),
  ],
);

export const expenses = pgTable(
  "expenses",
  {
    id: id(),
    tenantId: tenantId(),
    description: text("description").notNull(),
    vendor: text("vendor"),
    currency: text("currency", { enum: CURRENCIES }).notNull(),
    amountMinor: integer("amount_minor").notNull(),
    recurring: text("recurring", { enum: ["none", "monthly", "yearly"] }).notNull().default("none"),
    approvalId: uuid("approval_id"),
    incurredAt: date("incurred_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("expenses_tenant_id_uq").on(t.tenantId, t.id), check("expenses_amount_positive", sql`${t.amountMinor} > 0`)],
);

/* ---------------------------- Operations ---------------------------- */

export const agents = pgTable(
  "agents",
  {
    id: id(),
    tenantId: tenantId(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    responsibilities: jsonb("responsibilities").$type<string[]>().notNull(),
    /**
     * How this role is actually carried out today. 'manual' means a human or a
     * Claude session works the queue; it is not running on its own.
     */
    automation: text("automation", { enum: ["manual", "scheduled", "paused"] }).notNull().default("manual"),
    createdAt: createdAt(),
  },
  (t) => [unique("agents_tenant_id_uq").on(t.tenantId, t.id), unique("agents_tenant_key_uq").on(t.tenantId, t.key)],
);

export const agentTasks = pgTable(
  "agent_tasks",
  {
    id: id(),
    tenantId: tenantId(),
    agentId: uuid("agent_id").notNull(),
    title: text("title").notNull(),
    detail: text("detail"),
    status: text("status", { enum: ["queued", "in_progress", "blocked", "done", "cancelled"] })
      .notNull()
      .default("queued"),
    priority: integer("priority").notNull().default(3),
    dueAt: timestamp("due_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("agent_tasks_tenant_id_uq").on(t.tenantId, t.id),
    foreignKey({ columns: [t.tenantId, t.agentId], foreignColumns: [agents.tenantId, agents.id] }).onDelete("cascade"),
    check("agent_tasks_priority_range", sql`${t.priority} BETWEEN 1 AND 5`),
  ],
);

export const activityLog = pgTable(
  "activity_log",
  {
    id: id(),
    tenantId: tenantId(),
    actorType: text("actor_type", { enum: ["user", "agent", "system"] }).notNull(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("activity_log_tenant_created_idx").on(t.tenantId, t.createdAt)],
);

export const approvals = pgTable(
  "approvals",
  {
    id: id(),
    tenantId: tenantId(),
    kind: text("kind", { enum: ["spend", "outbound_message", "price_exception", "deploy", "other"] }).notNull(),
    title: text("title").notNull(),
    detail: text("detail"),
    currency: text("currency", { enum: CURRENCIES }),
    amountMinor: integer("amount_minor"),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
    requestedBy: text("requested_by").notNull(),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    createdAt: createdAt(),
  },
  (t) => [unique("approvals_tenant_id_uq").on(t.tenantId, t.id), index("approvals_tenant_status_idx").on(t.tenantId, t.status)],
);

export const objectives = pgTable(
  "objectives",
  {
    id: id(),
    tenantId: tenantId(),
    title: text("title").notNull(),
    metric: text("metric", {
      enum: ["prospects", "contacted", "replied", "meetings", "proposals", "customers", "revenue_ghs", "revenue_usd"],
    }).notNull(),
    targetValue: integer("target_value").notNull(),
    dueDate: date("due_date"),
    createdAt: createdAt(),
  },
  (t) => [unique("objectives_tenant_id_uq").on(t.tenantId, t.id)],
);

/* -------------------- Agency product: listings ---------------------- */

export const listings = pgTable(
  "listings",
  {
    id: id(),
    tenantId: tenantId(),
    title: text("title").notNull(),
    offerType: text("offer_type", { enum: ["sale", "rent"] }).notNull(),
    propertyType: text("property_type", { enum: ["house", "apartment", "land", "commercial", "other"] }).notNull(),
    currency: text("currency", { enum: CURRENCIES }).notNull(),
    priceMinor: integer("price_minor").notNull(),
    location: text("location").notNull(),
    bedrooms: integer("bedrooms"),
    bathrooms: integer("bathrooms"),
    description: text("description"),
    status: text("status", { enum: ["draft", "published", "archived"] }).notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("listings_tenant_id_uq").on(t.tenantId, t.id),
    index("listings_tenant_status_idx").on(t.tenantId, t.status),
    check("listings_price_nonneg", sql`${t.priceMinor} >= 0`),
  ],
);

export const enquiries = pgTable(
  "enquiries",
  {
    id: id(),
    tenantId: tenantId(),
    listingId: uuid("listing_id"),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    message: text("message").notNull(),
    status: text("status", { enum: ["new", "contacted", "qualified", "closed"] }).notNull().default("new"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("enquiries_tenant_id_uq").on(t.tenantId, t.id),
    // Listings are archived, never deleted, so enquiries keep their link.
    foreignKey({ columns: [t.tenantId, t.listingId], foreignColumns: [listings.tenantId, listings.id] }),
    check("enquiries_contact_present", sql`${t.email} IS NOT NULL OR ${t.phone} IS NOT NULL`),
  ],
);
