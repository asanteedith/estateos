import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { expenses } from "@/db/schema";
import { conflict } from "../shared/errors";
import { requireHq, requireRole, type TenantContext } from "../tenancy/context";
import { getApproval } from "../ops/approvals";
import { logActivity } from "../ops/activity";

export const expenseSchema = z.object({
  description: z.string().trim().min(3).max(300),
  vendor: z.string().trim().max(200).optional(),
  currency: z.enum(["GHS", "USD"]),
  amountMinor: z.number().int().positive(),
  recurring: z.enum(["none", "monthly", "yearly"]).default("none"),
  incurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  approvalId: z.string().uuid(),
});

/** Every cost needs an approved 'spend' approval covering at least this amount (development budget is zero by default). */
export async function recordExpense(db: Db, ctx: TenantContext, input: z.input<typeof expenseSchema>) {
  requireHq(ctx);
  requireRole(ctx, "admin");
  const data = expenseSchema.parse(input);
  const approval = await getApproval(db, ctx, data.approvalId);
  if (!approval || approval.kind !== "spend" || approval.status !== "approved") {
    throw conflict("An approved spend approval is required before recording a cost");
  }
  if (approval.currency !== data.currency || (approval.amountMinor ?? 0) < data.amountMinor) {
    throw conflict("The expense is larger than, or in a different currency from, what was approved");
  }
  const [row] = await db.insert(expenses).values({ tenantId: ctx.tenantId, ...data }).returning();
  await logActivity(db, ctx, { action: "expense.recorded", entityType: "expense", entityId: row.id, detail: { amountMinor: row.amountMinor, currency: row.currency } });
  return row;
}

export async function listExpenses(db: Db, ctx: TenantContext) {
  requireHq(ctx);
  return db.select().from(expenses).where(eq(expenses.tenantId, ctx.tenantId)).orderBy(desc(expenses.incurredAt)).limit(500);
}

export async function expensesForApproval(db: Db, ctx: TenantContext, approvalId: string) {
  return db
    .select()
    .from(expenses)
    .where(and(eq(expenses.tenantId, ctx.tenantId), eq(expenses.approvalId, approvalId)));
}
