import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { logout } from "@/modules/auth/service";
import { SESSION_COOKIE, clearSessionCookie, requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

async function logoutAction() {
  "use server";
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await logout(await getDb(), token);
  await clearSessionCookie();
  redirect("/login");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { tenant, user } = await requireSession();
  const hq = tenant.kind === "hq";
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/app" className="brand">EstateOS</Link>
        <div className="small muted">{tenant.name}</div>
        <nav aria-label="Main">
          {hq ? (
            <>
              <Link href="/app">Command Centre</Link>
              <div className="section">Sales</div>
              <Link href="/app/prospects">Prospects</Link>
              <Link href="/app/pipeline">Pipeline</Link>
              <Link href="/app/outreach">Outreach log</Link>
              <Link href="/app/meetings">Meetings</Link>
              <Link href="/app/proposals">Proposals</Link>
              <div className="section">Money</div>
              <Link href="/app/invoices">Invoices &amp; payments</Link>
              <Link href="/app/expenses">Expenses</Link>
              <div className="section">Operations</div>
              <Link href="/app/agents">Agents &amp; tasks</Link>
              <Link href="/app/approvals">Approvals</Link>
              <Link href="/app/activity">Activity log</Link>
            </>
          ) : (
            <>
              <Link href="/app">Overview</Link>
              <Link href="/app/listings">Listings</Link>
              <Link href="/app/enquiries">Enquiries</Link>
              <Link href={`/p/${tenant.slug}`}>Public page ↗</Link>
            </>
          )}
        </nav>
        <div style={{ marginTop: "1.5rem" }} className="small muted">
          {user.name}
          <form action={logoutAction}>
            <button className="secondary small" type="submit" style={{ marginTop: 6 }}>Log out</button>
          </form>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
