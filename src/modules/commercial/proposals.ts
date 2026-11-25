import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { proposals, prospects } from "@/db/schema";
import { conflict, notFound } from "../shared/errors";
import type { TenantContext } from "../tenancy/context";
import { logActivity } from "../ops/activity";
import { getApproval, requestApproval } from "../ops/approvals";
import { advanceStage, requireProspect, setStage } from "../crm/prospects";
import { createInvoice } from "../billing/invoices";
import { PACKAGE_SCOPE, depositAmount, marketFor, policyFor, withinPolicy } from "./pricing";
import { formatMoney } from "../shared/money";

export const proposalSchema = z.object({
  prospectId: z.string().uuid(),
  title: z.string().trim().min(3).max(200).default("EstateOS Complete Digital Package"),
  /** Leave empty to use list price for the prospect's market. */
  amountMinor: z.number().int().positive().optional(),
  currency: z.enum(["GHS", "USD"]).optional(),
  depositPercent: z.number().int().min(0).max(100).optional(),
  scope: z.string().trim().min(10).max(10000).optional(),
});

async function nextNumber(db: Db, tenantId: string) {
  const [{ n }] = await db.select({ n: count() }).from(proposals).where(eq(proposals.tenantId, tenantId));
  return `PRO-${new Date().getUTCFullYear()}-${String(n + 1).padStart(4, "0")}`;
}

export async function createProposal(db: Db, ctx: TenantContext, input: z.input<typeof proposalSchema>) {
  const data = proposalSchema.parse(input);
  const prospect = await requireProspect(db, ctx, data.prospectId);
  const market = marketFor(prospect.country);
  const policy = policyFor(market);
  const currency = data.currency ?? policy.currency;
  const amountMinor = data.amountMinor ?? policy.listPriceMinor;
  const depositPercent = data.depositPercent ?? policy.depositPercent;
  const ok = withinPolicy(market, currency, amountMinor, depositPercent);

  const number = await nextNumber(db, ctx.tenantId);
  const [row] = await db
    .insert(proposals)
    .values({
      tenantId: ctx.tenantId,
      prospectId: prospect.id,
      number,
      title: data.title,
      currency,
      amountMinor,
      depositPercent,
      scope: data.scope ?? PACKAGE_SCOPE,
      status: ok ? "draft" : "pending_approval",
    })
    .returning();

  if (!ok) {
    const approval = await requestApproval(db, ctx, {
      kind: "price_exception",
      title: `Price exception for ${prospect.companyName}: ${formatMoney(amountMinor, currency)} with ${depositPercent}% deposit`,
      detail: `Policy for ${market} is ${formatMoney(policy.listPriceMinor, policy.currency)} with a ${policy.depositPercent}% deposit.`,
      currency,
      amountMinor,
      entityType: "proposal",
      entityId: row.id,
      requestedBy: "sales",
    });
    await db
      .update(proposals)
      .set({ approvalId: approval.id })
      .where(and(eq(proposals.tenantId, ctx.tenantId), eq(proposals.id, row.id)));
    row.approvalId = approval.id;
  }
  await logActivity(db, ctx, { action: "proposal.created", entityType: "prospect", entityId: prospect.id, detail: { number, withinPolicy: ok } });
  return row;
}

async function requireProposal(db: Db, ctx: TenantContext, id: string) {
  const [row] = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.tenantId, ctx.tenantId), eq(proposals.id, id)))
    .limit(1);
  if (!row) throw notFound("Proposal");
  return row;
}

/** Records that the proposal was sent to the prospect. Blocked while a price exception is not approved. */
export async function markProposalSent(db: Db, ctx: TenantContext, id: string) {
  const p = await requireProposal(db, ctx, id);
  if (p.status === "pending_approval") {
    const approval = p.approvalId ? await getApproval(db, ctx, p.approvalId) : null;
    if (approval?.status !== "approved") throw conflict("This proposal is below policy price and needs founder approval first");
  } else if (p.status !== "draft") {
    throw conflict(`A ${p.status} proposal cannot be sent`);
  }
  const [row] = await db
    .update(proposals)
    .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
    .where(and(eq(proposals.tenantId, ctx.tenantId), eq(proposals.id, id)))
    .returning();
  await advanceStage(db, ctx, p.prospectId, "proposal");
  await logActivity(db, ctx, { action: "proposal.sent", entityType: "prospect", entityId: p.prospectId, detail: { number: p.number } });
  return row;
}

/** The prospect accepted: move to negotiation and raise the deposit invoice. */
export async function acceptProposal(db: Db, ctx: TenantContext, id: string) {
  const p = await requireProposal(db, ctx, id);
  if (p.status !== "sent") throw conflict("Only a sent proposal can be accepted");
  const [row] = await db
    .update(proposals)
    .set({ status: "accepted", updatedAt: new Date() })
    .where(and(eq(proposals.tenantId, ctx.tenantId), eq(proposals.id, id)))
    .returning();
  await advanceStage(db, ctx, p.prospectId, "negotiation");
  const invoice =
    p.depositPercent > 0
      ? await createInvoice(db, ctx, {
          prospectId: p.prospectId,
          proposalId: p.id,
          kind: "deposit",
          description: `${p.depositPercent}% deposit for ${p.title} (${p.number})`,
          currency: p.currency,
          amountMinor: depositAmount(p.amountMinor, p.depositPercent),
        })
      : null;
  await logActivity(db, ctx, { action: "proposal.accepted", entityType: "prospect", entityId: p.prospectId, detail: { number: p.number } });
  return { proposal: row, depositInvoice: invoice };
}

export async function closeProposal(db: Db, ctx: TenantContext, id: string, outcome: "rejected" | "expired") {
  const p = await requireProposal(db, ctx, id);
  if (!["draft", "pending_approval", "sent"].includes(p.status)) throw conflict(`A ${p.status} proposal cannot be closed`);
  const [row] = await db
    .update(proposals)
    .set({ status: outcome, updatedAt: new Date() })
    .where(and(eq(proposals.tenantId, ctx.tenantId), eq(proposals.id, id)))
    .returning();
  if (outcome === "rejected") await setStage(db, ctx, p.prospectId, "lost");
  await logActivity(db, ctx, { action: `proposal.${outcome}`, entityType: "prospect", entityId: p.prospectId, detail: { number: p.number } });
  return row;
}

export async function listProposals(db: Db, ctx: TenantContext) {
  return db
    .select({ proposal: proposals, companyName: prospects.companyName })
    .from(proposals)
    .innerJoin(prospects, and(eq(prospects.tenantId, proposals.tenantId), eq(prospects.id, proposals.prospectId)))
    .where(eq(proposals.tenantId, ctx.tenantId))
    .orderBy(desc(proposals.createdAt))
    .limit(500);
}
