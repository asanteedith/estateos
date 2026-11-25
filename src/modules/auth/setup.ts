import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { tenants } from "@/db/schema";
import { DomainError } from "../shared/errors";
import { bootstrapHq } from "./service";

/** Compares tokens in constant time. False when no token is configured. */
export function setupTokenMatches(given: string, configured: string | undefined) {
  if (!configured || configured.length < 24) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(configured).digest();
  return timingSafeEqual(a, b);
}

export async function hqExists(db: Db) {
  const [row] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.kind, "hq")).limit(1);
  return Boolean(row);
}

/**
 * One-time founder setup for a fresh deployment. Requires the SETUP_TOKEN
 * configured on the server and refuses once an HQ workspace exists.
 */
export async function runFirstSetup(
  db: Db,
  token: string,
  configuredToken: string | undefined,
  founder: { name: string; email: string; password: string },
) {
  if (!setupTokenMatches(token, configuredToken)) throw new DomainError("forbidden", "Setup link is not valid");
  if (await hqExists(db)) throw new DomainError("conflict", "EstateOS is already set up. Log in instead.");
  return bootstrapHq(db, founder);
}
