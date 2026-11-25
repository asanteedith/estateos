import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { memberships, sessions, tenants, users } from "@/db/schema";
import { DomainError, conflict, invalid } from "../shared/errors";
import type { TenantContext } from "../tenancy/context";
import { hashPassword, verifyPassword, dummyHash, MIN_PASSWORD_LENGTH } from "./password";
import { seedHqAgents } from "../ops/agents";

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const secretSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(200);

export const signupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  password: secretSchema,
  agencyName: z.string().trim().min(2).max(120),
  country: z.string().trim().max(60).optional(),
});

export function slugify(name: string) {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return base.length >= 2 ? base : `agency-${randomBytes(3).toString("hex")}`;
}

async function uniqueSlug(db: Db, name: string) {
  const base = slugify(name);
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const [hit] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, candidate)).limit(1);
    if (!hit) return candidate;
  }
  return `${base}-${randomBytes(3).toString("hex")}`;
}

/** Self-service sign-up for a real estate agency. Creates the agency workspace and its owner. */
export async function signupAgency(db: Db, input: z.input<typeof signupSchema>) {
  const data = signupSchema.parse(input);
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email)).limit(1);
  if (existing) throw conflict("An account with that email already exists");
  const passwordHash = await hashPassword(data.password);
  const slug = await uniqueSlug(db, data.agencyName);
  return db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({ name: data.agencyName, slug, kind: "agency", country: data.country || null })
      .returning();
    const [user] = await tx.insert(users).values({ name: data.name, email: data.email, passwordHash }).returning();
    await tx.insert(memberships).values({ tenantId: tenant.id, userId: user.id, role: "owner" });
    return { tenant, user };
  });
}

/**
 * Creates the EstateOS HQ workspace and the founder account. Safe to re-run:
 * it does nothing if an HQ workspace already exists.
 */
export async function bootstrapHq(db: Db, input: { name: string; email: string; password: string }) {
  const [hq] = await db.select().from(tenants).where(eq(tenants.kind, "hq")).limit(1);
  if (hq) return { tenant: hq, created: false as const };
  const e = emailSchema.parse(input.email);
  const pw = secretSchema.parse(input.password);
  const passwordHash = await hashPassword(pw);
  const result = await db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({ name: "EstateOS HQ", slug: "estateos-hq", kind: "hq", country: "GH" })
      .returning();
    let [user] = await tx.select().from(users).where(eq(users.email, e)).limit(1);
    if (!user) [user] = await tx.insert(users).values({ name: input.name, email: e, passwordHash }).returning();
    await tx.insert(memberships).values({ tenantId: tenant.id, userId: user.id, role: "owner" });
    return { tenant, user };
  });
  await seedHqAgents(db, result.tenant.id);
  return { tenant: result.tenant, created: true as const };
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Verifies credentials and opens a session in the user's first (or requested) workspace. Returns the raw token for the cookie. */
export async function login(db: Db, emailInput: string, secretInput: string, tenantSlug?: string) {
  const fail = () => new DomainError("unauthenticated", "Email or password is incorrect");
  const parsed = emailSchema.safeParse(emailInput);
  if (!parsed.success) throw fail();
  const [user] = await db.select().from(users).where(eq(users.email, parsed.data)).limit(1);
  // Always compare against a hash so response time does not reveal whether the email exists.
  const ok = await verifyPassword(secretInput, user?.passwordHash ?? (await dummyHash()));
  if (!user || !ok) throw fail();
  const rows = await db
    .select({ tenantId: memberships.tenantId, slug: tenants.slug })
    .from(memberships)
    .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
    .where(eq(memberships.userId, user.id));
  if (rows.length === 0) throw invalid("This account is not a member of any workspace");
  const chosen = (tenantSlug && rows.find((r) => r.slug === tenantSlug)) || rows[0];
  return createSession(db, user.id, chosen.tenantId);
}

export async function createSession(db: Db, userId: string, tenantId: string) {
  const [m] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.tenantId, tenantId)))
    .limit(1);
  if (!m) throw new DomainError("forbidden", "Not a member of that workspace");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ tokenHash: hashToken(token), userId, tenantId, expiresAt });
  return { token, expiresAt };
}

/** Resolves a session token to a TenantContext. Membership is re-checked on every request. */
export async function resolveSession(db: Db, token: string | undefined | null) {
  if (!token || token.length < 20 || token.length > 200) return null;
  const [row] = await db
    .select({
      userId: sessions.userId,
      tenantId: sessions.tenantId,
      role: memberships.role,
      tenantKind: tenants.kind,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
      userName: users.name,
      userEmail: users.email,
    })
    .from(sessions)
    .innerJoin(memberships, and(eq(memberships.userId, sessions.userId), eq(memberships.tenantId, sessions.tenantId)))
    .innerJoin(tenants, eq(tenants.id, sessions.tenantId))
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  const ctx: TenantContext = { tenantId: row.tenantId, tenantKind: row.tenantKind, userId: row.userId, role: row.role };
  return {
    ctx,
    tenant: { name: row.tenantName, slug: row.tenantSlug, kind: row.tenantKind },
    user: { name: row.userName, email: row.userEmail },
  };
}

export async function logout(db: Db, token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}
