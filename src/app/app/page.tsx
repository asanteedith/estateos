import Link from "next/link";
import { getDb } from "@/db/client";
import { commandCentreMetrics, needsAttention, objectivesProgress } from "@/modules/dashboard/metrics";
import { listAgents } from "@/modules/ops/agents";
import { listApprovals } from "@/modules/ops/approvals";
import { createObjective } from "@/modules/ops/objectives";
import { listActivity } from "@/modules/ops/activity";
import { listListings, listEnquiries } from "@/modules/listings/service";
import { requireSession } from "@/lib/session";
import { runAction, str } from "@/lib/actions";
import { Badge, Empty, Flash, Kpi, MoneyByCurrency, When, type SearchParams } from "../ui";

export const metadata = { title: "Command Centre" };

async function addObjective(fd: FormData) {
  "use server";
  await runAction("/app", async (db, ctx) => {
    await createObjective(db, ctx, {
      title: str(fd, "title") ?? "",
      metric: (str(fd, "metric") ?? "customers") as "customers",
      targetValue: Number(str(fd, "targetValue") ?? 0),
      dueDate: str(fd, "dueDate"),
    });
    return "Objective added";
  });
}

export default async function Dashboard({ searchParams }: { searchParams: SearchParams }) {
  const { ctx, tenant } = await requireSession();
  const db = await getDb();

  if (ctx.tenantKind !== "hq") {
    const [ls, enq] = await Promise.all([listListings(db, ctx), listEnquiries(db, ctx)]);
    return (
      <>
        <h1>{tenant.name}</h1>
        <Flash searchParams={searchParams} />
        <div className="grid kpis">
          <Kpi label="Published listings">{ls.filter((l) => l.status === "published").length}</Kpi>
          <Kpi label="Draft listings">{ls.filter((l) => l.status === "draft").length}</Kpi>
          <Kpi label="New enquiries">{enq.filter((e) => e.enquiry.status === "new").length}</Kpi>
          <Kpi label="All enquiries">{enq.length}</Kpi>
        </div>
        <p style={{ marginTop: "1rem" }}>
          Your public page: <Link href={`/p/${tenant.slug}`}>/p/{tenant.slug}</Link>
        </p>
      </>
    );
  }

  const [m, attention, agents, pending, objectives, activity] = await Promise.all([
    commandCentreMetrics(db, ctx),
    needsAttention(db, ctx),
    listAgents(db, ctx),
    listApprovals(db, ctx, "pending"),
    objectivesProgress(db, ctx),
    listActivity(db, ctx, 15),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Business Command Centre</h1>
          <div className="small muted">
            Every number below is counted from records in the database, as of <When at={m.asOf} />.
          </div>
        </div>
      </div>
      <Flash searchParams={searchParams} />

      <div className="grid kpis">
        <Kpi label="Prospects found" hint={`${m.verified} verified`}>{m.prospectsFound}</Kpi>
        <Kpi label="Contacted">{m.contacted}</Kpi>
        <Kpi label="Replied">{m.replied}</Kpi>
        <Kpi label="Meetings booked">{m.meetingsBooked}</Kpi>
        <Kpi label="Proposals issued">{m.proposalsIssued}</Kpi>
        <Kpi label="Paying customers">{m.customersWon}</Kpi>
        <Kpi label="Revenue collected" hint="Verified payments only"><MoneyByCurrency value={m.revenueCollected} /></Kpi>
        <Kpi label="Outstanding invoices"><MoneyByCurrency value={m.outstanding} /></Kpi>
        <Kpi label="Costs recorded"><MoneyByCurrency value={m.expenses} /></Kpi>
        <Kpi label="Agency workspaces" hint="Sign-ups on the platform">{m.agencyWorkspaces}</Kpi>
      </div>

      <div className="grid two" style={{ marginTop: "1rem" }}>
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Needs founder approval ({pending.length})</h2>
          {pending.length === 0 ? (
            <p className="muted">Nothing waiting.</p>
          ) : (
            <ul className="plain">
              {pending.slice(0, 8).map((a) => (
                <li key={a.id}>
                  <Badge value={a.kind} /> {a.title}
                </li>
              ))}
            </ul>
          )}
          <p><Link href="/app/approvals">Open approvals</Link></p>
        </section>

        <section className="card">
          <h2 style={{ marginTop: 0 }}>Needs attention</h2>
          <h3>Replies waiting for us ({attention.awaitingReply.length})</h3>
          {attention.awaitingReply.length === 0 ? <p className="muted">None.</p> : (
            <ul className="plain">
              {attention.awaitingReply.map((r) => (
                <li key={r.id}><Link href={`/app/prospects/${r.id}`}>{r.company_name}</Link> <span className="small muted">since <When at={r.last_at} /></span></li>
              ))}
            </ul>
          )}
          <h3>Overdue invoices ({attention.overdue.length})</h3>
          {attention.overdue.length === 0 ? <p className="muted">None.</p> : (
            <ul className="plain">
              {attention.overdue.map((i) => (
                <li key={i.id}>{i.number} · {i.companyName} <span className="small muted">due <When at={i.dueAt} /></span></li>
              ))}
            </ul>
          )}
          <h3>Meetings in the next 7 days ({attention.upcoming.length})</h3>
          {attention.upcoming.length === 0 ? <p className="muted">None.</p> : (
            <ul className="plain">
              {attention.upcoming.map((mt) => (
                <li key={mt.id}><When at={mt.scheduledAt} /> · {mt.kind} with {mt.companyName}</li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <h2>Objectives</h2>
      {objectives.length === 0 ? (
        <Empty>No objectives yet. Add one below, for example “First paying customer” with target 1.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Objective</th><th>Metric</th><th className="num">Current</th><th className="num">Target</th><th>Due</th></tr></thead>
            <tbody>
              {objectives.map((o) => (
                <tr key={o.id}>
                  <td>{o.title}</td>
                  <td>{o.metric.replace("_", " ")}</td>
                  <td className="num">{o.current}</td>
                  <td className="num">{o.targetValue}</td>
                  <td>{o.dueDate ?? "—"} {o.current >= o.targetValue && <Badge value="done" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <details className="card" style={{ marginTop: "0.75rem" }}>
        <summary>Add objective</summary>
        <form action={addObjective} className="fields" style={{ marginTop: "0.75rem" }}>
          <label>Title<input name="title" required /></label>
          <label>Metric
            <select name="metric">
              {["customers", "prospects", "contacted", "replied", "meetings", "proposals", "revenue_ghs", "revenue_usd"].map((x) => (
                <option key={x} value={x}>{x.replace("_", " ")}</option>
              ))}
            </select>
          </label>
          <label>Target<input name="targetValue" type="number" min={1} required /></label>
          <label>Due date<input name="dueDate" type="date" /></label>
          <div><button type="submit">Add</button></div>
        </form>
      </details>

      <h2>Agents</h2>
      <p className="small muted">
        These are operating roles. “Manual” means the work is done by a person or a Claude session working the queue, not by
        software running on its own.
      </p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Role</th><th>Mode</th><th className="num">Open tasks</th></tr></thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id}><td>{a.name}</td><td><Badge value={a.automation} /></td><td className="num">{a.openTasks}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p><Link href="/app/agents">Open the task queue</Link></p>

      <h2>Recent activity</h2>
      {activity.length === 0 ? <Empty>No activity recorded yet.</Empty> : (
        <ul className="plain card">
          {activity.map((a) => (
            <li key={a.id} className="small"><When at={a.createdAt} /> · <code>{a.action}</code> {a.detail && "title" in a.detail ? String(a.detail.title) : ""}{a.detail && "company" in a.detail ? String(a.detail.company) : ""}</li>
          ))}
        </ul>
      )}
    </>
  );
}
