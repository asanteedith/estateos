import { and, asc, count, countDistinct, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { approvals, expenses, invoices, meetings, objectives, outreach, payments, proposals, prospects, tenants } from "@/db/schema";
import { requireHq, type TenantContext } from "../tenancy/context";
import type { Currency } from "../shared/money";

type ByCurrency = Partial<Record<Currency, number>>;

function byCurrency(rows: { currency: Currency; total: number }[]): ByCurrency {
  const out: ByCurrency = {};
  for (const r of rows) out[r.currency] = Number(r.total);
  return out;
}

/**
 * Every number on the Command Centre comes from a query on stored records.
 * Nothing is estimated or seeded.
 */
export async function commandCentreMetrics(db: Db, ctx: TenantContext) {
  requireHq(ctx);
  const t = ctx.tenantId;
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 86400000);

  const [
    [{ prospectsFound }],
    [{ verified }],
    [{ contacted }],
    [{ replied }],
    [{ meetingsBooked }],
    [{ proposalsIssued }],
    [{ customersWon }],
    revenueRows,
    outstandingRows,
    expenseRows,
    [{ pendingApprovals }],
    [{ agencyWorkspaces }],
  ] = await Promise.all([
    db.select({ prospectsFound: count() }).from(prospects).where(eq(prospects.tenantId, t)),
    db.select({ verified: count() }).from(prospects).where(and(eq(prospects.tenantId, t), eq(prospects.verificationStatus, "verified"))),
    db
      .select({ contacted: countDistinct(outreach.prospectId) })
      .from(outreach)
      .where(and(eq(outreach.tenantId, t), eq(outreach.direction, "outbound"), eq(outreach.status, "sent"))),
    db
      .select({ replied: countDistinct(outreach.prospectId) })
      .from(outreach)
      .where(and(eq(outreach.tenantId, t), eq(outreach.direction, "inbound"))),
    db.select({ meetingsBooked: count() }).from(meetings).where(and(eq(meetings.tenantId, t), ne(meetings.status, "cancelled"))),
    db
      .select({ proposalsIssued: count() })
      .from(proposals)
      .where(and(eq(proposals.tenantId, t), inArray(proposals.status, ["sent", "accepted", "rejected", "expired"]))),
    db.select({ customersWon: count() }).from(prospects).where(and(eq(prospects.tenantId, t), eq(prospects.stage, "won"))),
    db
      .select({ currency: payments.currency, total: sql<number>`sum(${payments.amountMinor})::int` })
      .from(payments)
      .where(eq(payments.tenantId, t))
      .groupBy(payments.currency),
    db
      .select({
        currency: invoices.currency,
        total: sql<number>`sum(${invoices.amountMinor} - coalesce((select sum(p.amount_minor) from ${payments} p where p.tenant_id = "invoices"."tenant_id" and p.invoice_id = "invoices"."id"), 0))::int`,
      })
      .from(invoices)
      .where(and(eq(invoices.tenantId, t), inArray(invoices.status, ["issued", "partially_paid"])))
      .groupBy(invoices.currency),
    db
      .select({ currency: expenses.currency, total: sql<number>`sum(${expenses.amountMinor})::int` })
      .from(expenses)
      .where(eq(expenses.tenantId, t))
      .groupBy(expenses.currency),
    db.select({ pendingApprovals: count() }).from(approvals).where(and(eq(approvals.tenantId, t), eq(approvals.status, "pending"))),
    db.select({ agencyWorkspaces: count() }).from(tenants).where(eq(tenants.kind, "agency")),
  ]);

  return {
    prospectsFound,
    verified,
    contacted,
    replied,
    meetingsBooked,
    proposalsIssued,
    customersWon,
    agencyWorkspaces,
    revenueCollected: byCurrency(revenueRows),
    outstanding: byCurrency(outstandingRows),
    expenses: byCurrency(expenseRows),
    pendingApprovals,
    asOf: now,
    weekAhead,
  };
}

/** Items that need a human: unanswered replies, overdue invoices, meetings in the next 7 days. */
export async function needsAttention(db: Db, ctx: TenantContext) {
  requireHq(ctx);
  const t = ctx.tenantId;
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 86400000);

  const awaitingReply: unknown = await db.execute(sql`
    select p.id, p.company_name, o.occurred_at as last_at
    from ${prospects} p
    join lateral (
      select direction, occurred_at from ${outreach} o
      where o.tenant_id = p.tenant_id and o.prospect_id = p.id and o.status in ('sent','received')
      order by o.occurred_at desc nulls last, o.created_at desc limit 1
    ) o on true
    where p.tenant_id = ${t} and o.direction = 'inbound' and p.stage not in ('won','lost')
    order by o.occurred_at asc
    limit 50`);

  const overdue = await db
    .select({ id: invoices.id, number: invoices.number, dueAt: invoices.dueAt, companyName: prospects.companyName })
    .from(invoices)
    .innerJoin(prospects, and(eq(prospects.tenantId, invoices.tenantId), eq(prospects.id, invoices.prospectId)))
    .where(and(eq(invoices.tenantId, t), inArray(invoices.status, ["issued", "partially_paid"]), lt(invoices.dueAt, now)))
    .orderBy(asc(invoices.dueAt))
    .limit(50);

  const upcoming = await db
    .select({ id: meetings.id, scheduledAt: meetings.scheduledAt, kind: meetings.kind, companyName: prospects.companyName })
    .from(meetings)
    .innerJoin(prospects, and(eq(prospects.tenantId, meetings.tenantId), eq(prospects.id, meetings.prospectId)))
    .where(and(eq(meetings.tenantId, t), eq(meetings.status, "scheduled"), gte(meetings.scheduledAt, now), lt(meetings.scheduledAt, weekAhead)))
    .orderBy(asc(meetings.scheduledAt))
    .limit(50);

  // postgres-js returns an array; PGlite returns { rows }.
  const rows = Array.isArray(awaitingReply) ? awaitingReply : (awaitingReply as { rows: unknown[] }).rows;
  return { awaitingReply: rows as { id: string; company_name: string; last_at: string }[], overdue, upcoming };
}

export async function objectivesProgress(db: Db, ctx: TenantContext) {
  requireHq(ctx);
  const [list, m] = await Promise.all([
    db.select().from(objectives).where(eq(objectives.tenantId, ctx.tenantId)).orderBy(asc(objectives.dueDate)),
    commandCentreMetrics(db, ctx),
  ]);
  const current: Record<(typeof objectives.$inferSelect)["metric"], number> = {
    prospects: m.prospectsFound,
    contacted: m.contacted,
    replied: m.replied,
    meetings: m.meetingsBooked,
    proposals: m.proposalsIssued,
    customers: m.customersWon,
    revenue_ghs: Math.floor((m.revenueCollected.GHS ?? 0) / 100),
    revenue_usd: Math.floor((m.revenueCollected.USD ?? 0) / 100),
  };
  return list.map((o) => ({ ...o, current: current[o.metric] }));
}
