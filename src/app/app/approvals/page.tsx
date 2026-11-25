import { getDb } from "@/db/client";
import { decideApproval, listApprovals, requestApproval } from "@/modules/ops/approvals";
import { parseMoneyToMinor } from "@/modules/shared/money";
import { requireHqSession } from "@/lib/session";
import { runAction, str } from "@/lib/actions";
import { Badge, Empty, Flash, Money, When, type SearchParams } from "../../ui";

export const metadata = { title: "Approvals" };

async function decide(fd: FormData) {
  "use server";
  await runAction("/app/approvals", async (db, ctx) => {
    const decision = str(fd, "decision") === "approved" ? "approved" : "rejected";
    await decideApproval(db, ctx, str(fd, "id")!, decision, str(fd, "note"));
    return `Marked ${decision}`;
  });
}

async function request(fd: FormData) {
  "use server";
  await runAction("/app/approvals", async (db, ctx) => {
    const amount = str(fd, "amount");
    await requestApproval(db, ctx, {
      kind: (str(fd, "kind") ?? "other") as "other",
      title: str(fd, "title") ?? "",
      detail: str(fd, "detail"),
      currency: amount ? ((str(fd, "currency") ?? "USD") as "USD") : undefined,
      amountMinor: amount ? parseMoneyToMinor(amount) : undefined,
      requestedBy: `user:${ctx.userId}`,
    });
    return "Approval requested";
  });
}

export default async function ApprovalsPage({ searchParams }: { searchParams: SearchParams }) {
  const { ctx } = await requireHqSession();
  const rows = await listApprovals(await getDb(), ctx);
  const isOwner = ctx.role === "owner";
  return (
    <>
      <h1>Approvals</h1>
      <p className="small muted">
        Anything that costs money, prices below policy, deploys to production or sends a message on the founder&apos;s behalf
        waits here for a decision. {isOwner ? "" : "Only the owner can decide."}
      </p>
      <Flash searchParams={searchParams} />
      {rows.length === 0 ? <Empty>No approvals requested yet.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Requested</th><th>Kind</th><th>What</th><th className="num">Amount</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td><When at={a.createdAt} /><div className="small muted">{a.requestedBy}</div></td>
                  <td><Badge value={a.kind} /></td>
                  <td><strong>{a.title}</strong>{a.detail && <div className="small" style={{ whiteSpace: "pre-wrap" }}>{a.detail}</div>}{a.decisionNote && <div className="small muted">Note: {a.decisionNote}</div>}</td>
                  <td className="num">{a.amountMinor && a.currency ? <Money minor={a.amountMinor} currency={a.currency} /> : "—"}</td>
                  <td><Badge value={a.status} />{a.decidedAt && <div className="small muted"><When at={a.decidedAt} /></div>}</td>
                  <td>
                    {a.status === "pending" && isOwner && (
                      <form action={decide} className="stack" style={{ minWidth: 180 }}>
                        <input type="hidden" name="id" value={a.id} />
                        <input name="note" placeholder="Note (optional)" />
                        <span style={{ display: "flex", gap: 6 }}>
                          <button className="small" name="decision" value="approved">Approve</button>
                          <button className="small danger" name="decision" value="rejected">Reject</button>
                        </span>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <details className="card" style={{ marginTop: "1rem" }}>
        <summary>Request an approval</summary>
        <form action={request} className="stack" style={{ marginTop: "0.75rem" }}>
          <div className="fields">
            <label>Kind<select name="kind"><option value="spend">spend</option><option value="outbound_message">outbound message</option><option value="deploy">deploy</option><option value="price_exception">price exception</option><option value="other">other</option></select></label>
            <label>Title<input name="title" required minLength={3} /></label>
            <label>Amount (if spend)<input name="amount" inputMode="decimal" /></label>
            <label>Currency<select name="currency"><option>USD</option><option>GHS</option></select></label>
          </div>
          <label>Detail<textarea name="detail" /></label>
          <div><button type="submit">Request</button></div>
        </form>
      </details>
    </>
  );
}
