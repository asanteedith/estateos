import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getDb } from "@/db/client";
import { createSession, signupAgency } from "@/modules/auth/service";
import { MIN_PASSWORD_LENGTH } from "@/modules/auth/password";
import { setSessionCookie } from "@/lib/session";
import { userMessage } from "@/lib/actions";
import { allow } from "@/lib/rate-limit";
import { Flash, type SearchParams } from "../ui";

export const metadata = { title: "Create your agency workspace" };

async function signupAction(fd: FormData) {
  "use server";
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allow(`signup:${ip}`, 5, 60 * 60_000)) {
    redirect(`/signup?error=${encodeURIComponent("Too many sign-ups from this network. Try again later.")}`);
  }
  let target = "/app";
  try {
    const db = await getDb();
    const { user, tenant } = await signupAgency(db, {
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      password: String(fd.get("password") ?? ""),
      agencyName: String(fd.get("agencyName") ?? ""),
      country: String(fd.get("country") ?? "") || undefined,
    });
    const { token, expiresAt } = await createSession(db, user.id, tenant.id);
    await setSessionCookie(token, expiresAt);
  } catch (e) {
    target = `/signup?error=${encodeURIComponent(userMessage(e))}`;
  }
  redirect(target);
}

export default function SignupPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="wrap" style={{ maxWidth: 480, paddingTop: "3rem" }}>
      <h1>Create your agency workspace</h1>
      <p className="muted">You will be the owner of the workspace.</p>
      <Flash searchParams={searchParams} />
      <form action={signupAction} className="stack card">
        <label>
          Agency name
          <input name="agencyName" required minLength={2} maxLength={120} />
        </label>
        <label>
          Country
          <input name="country" placeholder="Ghana" maxLength={60} />
        </label>
        <label>
          Your name
          <input name="name" required maxLength={120} autoComplete="name" />
        </label>
        <label>
          Email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Password (at least {MIN_PASSWORD_LENGTH} characters)
          <input name="password" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
        </label>
        <button type="submit">Create workspace</button>
      </form>
      <p className="small muted" style={{ marginTop: "1rem" }}>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </main>
  );
}
