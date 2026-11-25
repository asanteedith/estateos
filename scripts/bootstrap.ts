/**
 * Creates the EstateOS HQ workspace and the founder login. Run once, with the
 * founder's details in the environment (see README "First run").
 * Seeds the nine agent roles. Does not create any prospects, customers or numbers.
 */
import { getDb } from "../src/db/client";
import { bootstrapHq } from "../src/modules/auth/service";

async function main() {
  const name = process.env.FOUNDER_NAME ?? "Founder";
  const email = process.env.FOUNDER_EMAIL;
  const secret = process.env.FOUNDER_PASSWORD;
  if (!email || !secret) throw new Error("Set FOUNDER_EMAIL and FOUNDER_PASSWORD");
  const db = await getDb();
  const result = await bootstrapHq(db, { name, email, password: secret });
  console.log(result.created ? `Created ${result.tenant.name}.` : `${result.tenant.name} already exists; nothing changed.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
