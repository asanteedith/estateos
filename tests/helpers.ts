import { createPgliteDb, type Db } from "@/db/client";
import { bootstrapHq, resolveSession, login, signupAgency } from "@/modules/auth/service";
import type { TenantContext } from "@/modules/tenancy/context";

export const TEST_SECRET = "correct-horse-battery";

export async function freshDb(): Promise<Db> {
  return createPgliteDb();
}

export async function ctxFor(db: Db, email: string): Promise<TenantContext> {
  const { token } = await login(db, email, TEST_SECRET);
  const s = await resolveSession(db, token);
  if (!s) throw new Error("no session");
  return s.ctx;
}

export async function setupHqAndAgencies(db: Db) {
  await bootstrapHq(db, { name: "Founder", email: "founder@example.test", password: TEST_SECRET });
  await signupAgency(db, { name: "Ama", email: "ama@agency-a.test", password: TEST_SECRET, agencyName: "Agency A", country: "GH" });
  await signupAgency(db, { name: "Ben", email: "ben@agency-b.test", password: TEST_SECRET, agencyName: "Agency B", country: "GB" });
  return {
    hq: await ctxFor(db, "founder@example.test"),
    a: await ctxFor(db, "ama@agency-a.test"),
    b: await ctxFor(db, "ben@agency-b.test"),
  };
}
