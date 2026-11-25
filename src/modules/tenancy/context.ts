import { forbidden } from "../shared/errors";

export type Role = "owner" | "admin" | "member";

/**
 * Every service call receives a TenantContext. Services must scope every query
 * with `ctx.tenantId`; they never accept a tenant id from request input.
 */
export interface TenantContext {
  tenantId: string;
  tenantKind: "hq" | "agency";
  userId: string;
  role: Role;
}

const RANK: Record<Role, number> = { member: 1, admin: 2, owner: 3 };

export function requireRole(ctx: TenantContext, min: Role) {
  if (RANK[ctx.role] < RANK[min]) throw forbidden(`This needs the ${min} role`);
}

/** Business Command Centre features are only for the EstateOS HQ workspace. */
export function requireHq(ctx: TenantContext) {
  if (ctx.tenantKind !== "hq") throw forbidden("Only available in the EstateOS HQ workspace");
}

export function actorLabel(ctx: TenantContext) {
  return `user:${ctx.userId}`;
}
