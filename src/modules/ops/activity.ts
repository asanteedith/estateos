import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { activityLog } from "@/db/schema";
import type { TenantContext } from "../tenancy/context";

export interface ActivityInput {
  action: string;
  entityType?: string;
  entityId?: string;
  detail?: Record<string, unknown>;
  actorType?: "user" | "agent" | "system";
  actorId?: string;
}

export async function logActivity(db: Db, ctx: TenantContext, a: ActivityInput) {
  await db.insert(activityLog).values({
    tenantId: ctx.tenantId,
    actorType: a.actorType ?? "user",
    actorId: a.actorId ?? ctx.userId,
    action: a.action,
    entityType: a.entityType,
    entityId: a.entityId,
    detail: a.detail,
  });
}

export async function listActivity(db: Db, ctx: TenantContext, limit = 50) {
  return db
    .select()
    .from(activityLog)
    .where(eq(activityLog.tenantId, ctx.tenantId))
    .orderBy(desc(activityLog.createdAt))
    .limit(Math.min(limit, 200));
}

export async function listActivityFor(db: Db, ctx: TenantContext, entityId: string) {
  return db
    .select()
    .from(activityLog)
    .where(and(eq(activityLog.tenantId, ctx.tenantId), eq(activityLog.entityId, entityId)))
    .orderBy(desc(activityLog.createdAt));
}
