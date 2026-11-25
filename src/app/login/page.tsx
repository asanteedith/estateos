import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getDb } from "@/db/client";
import { login } from "@/modules/auth/service";
import { setSessionCookie } from "@/lib/session";
import { userMessage } from "@/lib/actions";
import { allow } from "@/lib/rate-limit";
import { Flash, type SearchParams } from "../ui";

export const metadata = { title: "Log in" };

async function loginAction(fd: FormData) {
  "use server";
  const email = String(fd.get("email") ?? "");
  const secret = String(fd.get("password") ?? "");
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allow(`login:${ip}`, 20, 15 * 60_000) || !allow(`login:${email.toLowerCase()}`, 8, 15 * 60_000)) {
    redirect(`/login?error=${encodeURIComponent("Too many attempts. Try again in 15 minutes.")}`);
  }
  let ok = false;
  let message = "";
  try {
    const { token, expiresAt } = await login(await getDb(), email, secret);
    await setSessionCookie(token, expiresAt);
    ok = true;
  } catch (e) {
    message = userMessage(e);
  }
  redirect(ok ? "/app" : `/login?error=${encodeURIComponent(message)}`);
}

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="wrap" style={{ maxWidth: 420, paddingTop: "4rem" }}>
      <h1>Log in to EstateOS</h1>
      <Flash searchParams={searchParams} />
      <form action={loginAction} className="stack card">
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button type="submit">Log in</button>
      </form>
      <p className="small muted" style={{ marginTop: "1rem" }}>
        New agency? <Link href="/signup">Create a workspace</Link>
      </p>
    </main>
  );
}
