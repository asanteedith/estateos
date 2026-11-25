import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { runFirstSetup, setupTokenMatches } from "@/modules/auth/setup";
import { freshDb, TEST_SECRET } from "./helpers";

const TOKEN = "a".repeat(32);
const founder = { name: "Founder", email: "f@example.test", password: TEST_SECRET };

describe("first-run setup", () => {
  it("rejects missing, short or wrong tokens", () => {
    expect(setupTokenMatches(TOKEN, undefined)).toBe(false);
    expect(setupTokenMatches("short", "short")).toBe(false);
    expect(setupTokenMatches("b".repeat(32), TOKEN)).toBe(false);
    expect(setupTokenMatches(TOKEN, TOKEN)).toBe(true);
  });

  it("creates HQ once, then refuses", async () => {
    const db = await freshDb();
    await expect(runFirstSetup(db, "wrong-token-wrong-token-xx", TOKEN, founder)).rejects.toThrow("not valid");
    const res = await runFirstSetup(db, TOKEN, TOKEN, founder);
    expect(res.created).toBe(true);
    await expect(runFirstSetup(db, TOKEN, TOKEN, { ...founder, email: "x@example.test" })).rejects.toThrow("already set up");
  });

  it("row-level security is on for every table", async () => {
    const db = await freshDb();
    const res: unknown = await db.execute(
      sql`select count(*)::int as n from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    const rows = Array.isArray(res) ? res : (res as { rows: { n: number }[] }).rows;
    expect(rows[0].n).toBe(0);
  });
});
