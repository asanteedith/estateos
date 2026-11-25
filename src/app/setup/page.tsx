import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { getDb, migrateConfiguredDb } from "@/db/client";
import { createSession } from "@/modules/auth/service";
import { MIN_PASSWORD_LENGTH } from "@/modules/auth/password";
import { hqExists, runFirstSetup, setupTokenMatches } from "@/modules/auth/setup";
import { setSessionCookie } from "@/lib/session";
import { userMessage } from "@/lib/actions";
import { allow } from "@/lib/rate-limit";
import { Flash, type SearchParams } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up EstateOS", robots: { index: false } };

async function setupAction(fd: FormData) {
  "use server";
  const token = String(fd.get("token") ?? "");
  const back = `/setup?token=${encodeURIComponent(token)}`;
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allow(`setup:${ip}`, 10, 60 * 60_000)) redirect(`${back}&error=${encodeURIComponent("Too many attempts")}`);
  let target = "/app";
  try {
    if (!setupTokenMatches(token, process.env.SETUP_TOKEN)) throw new Error("bad token");
    await migrateConfiguredDb();
    const db = await getDb();
    const res = await runFirstSetup(db, token, process.env.SETUP_TOKEN, {
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      password: String(fd.get("password") ?? ""),
    });
    const [m] = await db.query.memberships.findMany({ where: (t, { eq }) => eq(t.tenantId, res.tenant.id), limit: 1 });
    const { token: session, expiresAt } = await createSession(db, m.userId, res.tenant.id);
    await setSessionCookie(session, expiresAt);
  } catch (e) {
    target = e instanceof Error && e.message === "bad token" ? "/login" : `${back}&error=${encodeURIComponent(userMessage(e))}`;
  }
  redirect(target);
}

export default async function SetupPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  // Without the right token this page does not exist.
  if (!setupTokenMatches(token, process.env.SETUP_TOKEN)) notFound();
  let done = false;
  try {
    done = await hqExists(await getDb());
  } catch {
    done = false; // tables not created yet
  }
  if (done) redirect("/login");
  return (
    <main className="wrap" style={{ maxWidth: 480, paddingTop: "3rem" }}>
      <h1>Set up EstateOS</h1>
      <p className="muted">
        Creates the database tables, the EstateOS HQ workspace and your founder login. This page stops working once setup is done.
      </p>
      <Flash searchParams={searchParams} />
      <form action={setupAction} className="stack card">
        <input type="hidden" name="token" value={token} />
        <label>Your name<input name="name" required autoComplete="name" /></label>
        <label>Email<input name="email" type="email" required autoComplete="email" /></label>
        <label>
          Password (at least {MIN_PASSWORD_LENGTH} characters)
          <input name="password" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
        </label>
        <button type="submit">Create HQ and log in</button>
      </form>
    </main>
  );
}
