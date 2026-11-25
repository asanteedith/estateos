import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { approvals } from "@/db/schema";
import { conflict, notFound } from "../shared/errors";
import { requireRole, type TenantContext } from "../tenancy/context";
import { logActivity } from "./activity";

export const approvalSchema = z.object({
  kind: z.enum(["spend", "outbound_message", "price_exception", "deploy", "other"]),
  title: z.string().trim().min(3).max(200),
  detail: z.string().trim().max(4000).optional(),
  currency: z.enum(["GHS", "USD"]).optional(),
  amountMinor: z.number().int().positive().optional(),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  requestedBy: z.string().min(1).default("system"),
});

export async function requestApproval(db: Db, ctx: TenantContext, input: z.input<typeof approvalSchema>) {
  const data = approvalSchema.parse(input);
  const [row] = await db.insert(approvals).values({ tenantId: ctx.tenantId, ...data }).returning();
  await logActivity(db, ctx, { action: "approval.requested", entityType: "approval", entityId: row.id, detail: { kind: row.kind, title: row.title } });
  return row;
}

/** Only owners decide approvals. A decision is final. */
export async function decideApproval(
  db: Db,
  ctx: TenantContext,
  approvalId: string,
  decision: "approved" | "rejected",
  note?: string,
) {
  requireRole(ctx, "owner");
  const [current] = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.tenantId, ctx.tenantId), eq(approvals.id, approvalId)))
    .limit(1);
  if (!current) throw notFound("Approval");
  if (current.status !== "pending") throw conflict("This approval has already been decided");
  const [row] = await db
    .update(approvals)
    .set({ status: decision, decidedByUserId: ctx.userId, decidedAt: new Date(), decisionNote: note?.slice(0, 2000) })
    .where(and(eq(approvals.tenantId, ctx.tenantId), eq(approvals.id, approvalId), eq(approvals.status, "pending")))
    .returning();
  if (!row) throw conflict("This approval has already been decided");
  await logActivity(db, ctx, { action: `approval.${decision}`, entityType: "approval", entityId: row.id, detail: { title: row.title } });
  return row;
}

export async function getApproval(db: Db, ctx: TenantContext, approvalId: string) {
  const [row] = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.tenantId, ctx.tenantId), eq(approvals.id, approvalId)))
    .limit(1);
  return row ?? null;
}

export async function listApprovals(db: Db, ctx: TenantContext, status?: "pending" | "approved" | "rejected") {
  const where = status
    ? and(eq(approvals.tenantId, ctx.tenantId), eq(approvals.status, status))
    : eq(approvals.tenantId, ctx.tenantId);
  return db.select().from(approvals).where(where).orderBy(desc(approvals.createdAt)).limit(200);
}
