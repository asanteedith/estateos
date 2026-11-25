import Link from "next/link";
import { getDb } from "@/db/client";
import { acceptProposal, closeProposal, listProposals, markProposalSent } from "@/modules/commercial/proposals";
import { requireHqSession } from "@/lib/session";
import { runAction, str } from "@/lib/actions";
import { Badge, Empty, Flash, Money, When, type SearchParams } from "../../ui";

export const metadata = { title: "Proposals" };

async function proposalStep(fd: FormData) {
  "use server";
  await runAction("/app/proposals", async (db, ctx) => {
    const id = str(fd, "id")!;
    const step = str(fd, "step");
    if (step === "sent") {
      await markProposalSent(db, ctx, id);
      return "Proposal marked as sent";
    }
    if (step === "accepted") {
      const { depositInvoice } = await acceptProposal(db, ctx, id);
      return depositInvoice ? `Accepted. Deposit invoice ${depositInvoice.number} created as a draft.` : "Accepted";
    }
    if (step === "rejected" || step === "expired") {
      await closeProposal(db, ctx, id, step);
      return `Proposal ${step}`;
    }
    return "Nothing changed";
  });
}

export default async function ProposalsPage({ searchParams }: { searchParams: SearchParams }) {
  const { ctx } = await requireHqSession();
  const rows = await listProposals(await getDb(), ctx);
  return (
    <>
      <h1>Proposals</h1>
      <p className="small muted">
        Create proposals from a prospect&apos;s page. Mark one as sent only after it has actually gone to the prospect.
      </p>
      <Flash searchParams={searchParams} />
      {rows.length === 0 ? <Empty>No proposals yet.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Number</th><th>Prospect</th><th className="num">Amount</th><th className="num">Deposit</th><th>Status</th><th>Sent</th><th></th></tr></thead>
            <tbody>
              {rows.map(({ proposal: p, companyName }) => (
                <tr key={p.id}>
                  <td>{p.number}<div className="small muted">{p.title}</div></td>
                  <td><Link href={`/app/prospects/${p.prospectId}`}>{companyName}</Link></td>
                  <td className="num"><Money minor={p.amountMinor} currency={p.currency} /></td>
                  <td className="num">{p.depositPercent}%</td>
                  <td><Badge value={p.status} /></td>
                  <td><When at={p.sentAt} /></td>
                  <td>
                    <form action={proposalStep} className="inline">
                      <input type="hidden" name="id" value={p.id} />
                      {(p.status === "draft" || p.status === "pending_approval") && <button className="small" name="step" value="sent">Mark sent</button>}
                      {p.status === "sent" && <button className="small" name="step" value="accepted">Accepted</button>}
                      {["draft", "pending_approval", "sent"].includes(p.status) && (
                        <>
                          <button className="small danger" name="step" value="rejected">Rejected</button>
                          <button className="small secondary" name="step" value="expired">Expired</button>
                        </>
                      )}
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <details className="card" style={{ marginTop: "1rem" }}>
        <summary>Scope of each proposal</summary>
        {rows.map(({ proposal: p }) => (
          <div key={p.id}><h3>{p.number}</h3><pre style={{ whiteSpace: "pre-wrap", font: "inherit" }}>{p.scope}</pre></div>
        ))}
      </details>
    </>
  );
}
