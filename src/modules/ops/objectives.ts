import { z } from "zod";
import type { Db } from "@/db/client";
import { objectives } from "@/db/schema";
import { requireHq, requireRole, type TenantContext } from "../tenancy/context";
import { logActivity } from "./activity";

export const objectiveSchema = z.object({
  title: z.string().trim().min(3).max(200),
  metric: z.enum(["prospects", "contacted", "replied", "meetings", "proposals", "customers", "revenue_ghs", "revenue_usd"]),
  targetValue: z.coerce.number().int().positive(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export async function createObjective(db: Db, ctx: TenantContext, input: z.input<typeof objectiveSchema>) {
  requireHq(ctx);
  requireRole(ctx, "admin");
  const data = objectiveSchema.parse(input);
  const [row] = await db.insert(objectives).values({ tenantId: ctx.tenantId, ...data }).returning();
  await logActivity(db, ctx, { action: "objective.created", entityType: "objective", entityId: row.id, detail: { title: row.title } });
  return row;
}
