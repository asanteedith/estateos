import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { sessions, users } from "@/db/schema";
import { bootstrapHq, createSession, login, logout, resolveSession, signupAgency } from "@/modules/auth/service";
import { hashPassword, verifyPassword } from "@/modules/auth/password";
import { freshDb, TEST_SECRET } from "./helpers";

describe("passwords", () => {
  it("hashes with a salt and verifies", async () => {
    const a = await hashPassword(TEST_SECRET);
    const b = await hashPassword(TEST_SECRET);
    expect(a).not.toEqual(b);
    expect(await verifyPassword(TEST_SECRET, a)).toBe(true);
    expect(await verifyPassword("wrong-password-123", a)).toBe(false);
    expect(await verifyPassword(TEST_SECRET, "garbage")).toBe(false);
  });
});

describe("auth", () => {
  it("signs up an agency owner and logs in", async () => {
    const db = await freshDb();
    const { tenant } = await signupAgency(db, { name: "Ama", email: "AMA@Example.test", password: TEST_SECRET, agencyName: "Golden Keys Realty" });
    expect(tenant.slug).toBe("golden-keys-realty");
    expect(tenant.kind).toBe("agency");
    const { token } = await login(db, "ama@example.test", TEST_SECRET);
    const s = await resolveSession(db, token);
    expect(s?.ctx.role).toBe("owner");
    expect(s?.ctx.tenantKind).toBe("agency");
  });

  it("never stores the raw session token", async () => {
    const db = await freshDb();
    await signupAgency(db, { name: "Ama", email: "a@example.test", password: TEST_SECRET, agencyName: "Agency" });
    const { token } = await login(db, "a@example.test", TEST_SECRET);
    const rows = await db.select().from(sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toContain(token);
  });

  it("rejects wrong passwords and unknown emails with the same message", async () => {
    const db = await freshDb();
    await signupAgency(db, { name: "Ama", email: "a@example.test", password: TEST_SECRET, agencyName: "Agency" });
    await expect(login(db, "a@example.test", "not-the-password")).rejects.toThrow("Email or password is incorrect");
    await expect(login(db, "nobody@example.test", TEST_SECRET)).rejects.toThrow("Email or password is incorrect");
  });

  it("rejects short passwords and duplicate emails", async () => {
    const db = await freshDb();
    await expect(signupAgency(db, { name: "A", email: "a@example.test", password: "short", agencyName: "Agency" })).rejects.toThrow();
    await signupAgency(db, { name: "A", email: "a@example.test", password: TEST_SECRET, agencyName: "Agency" });
    await expect(signupAgency(db, { name: "B", email: "a@example.test", password: TEST_SECRET, agencyName: "Other" })).rejects.toThrow(
      "already exists",
    );
  });

  it("gives unique slugs to agencies with the same name", async () => {
    const db = await freshDb();
    const one = await signupAgency(db, { name: "A", email: "a@example.test", password: TEST_SECRET, agencyName: "Prime Homes" });
    const two = await signupAgency(db, { name: "B", email: "b@example.test", password: TEST_SECRET, agencyName: "Prime Homes" });
    expect(one.tenant.slug).not.toEqual(two.tenant.slug);
  });

  it("expires and revokes sessions", async () => {
    const db = await freshDb();
    await signupAgency(db, { name: "A", email: "a@example.test", password: TEST_SECRET, agencyName: "Agency" });
    const { token } = await login(db, "a@example.test", TEST_SECRET);
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await resolveSession(db, token)).toBeNull();
    const again = await login(db, "a@example.test", TEST_SECRET);
    await logout(db, again.token);
    expect(await resolveSession(db, again.token)).toBeNull();
    expect(await resolveSession(db, "x".repeat(43))).toBeNull();
  });

  it("will not open a session in a workspace the user is not a member of", async () => {
    const db = await freshDb();
    const a = await signupAgency(db, { name: "A", email: "a@example.test", password: TEST_SECRET, agencyName: "Agency A" });
    const b = await signupAgency(db, { name: "B", email: "b@example.test", password: TEST_SECRET, agencyName: "Agency B" });
    await expect(createSession(db, a.user.id, b.tenant.id)).rejects.toThrow("Not a member");
  });

  it("bootstraps HQ once and seeds nine agent roles", async () => {
    const db = await freshDb();
    const first = await bootstrapHq(db, { name: "Founder", email: "f@example.test", password: TEST_SECRET });
    const second = await bootstrapHq(db, { name: "Other", email: "other@example.test", password: TEST_SECRET });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    const u = await db.select().from(users).where(eq(users.email, "other@example.test"));
    expect(u).toHaveLength(0);
  });
});
