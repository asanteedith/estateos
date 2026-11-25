import Link from "next/link";
import { getDb } from "@/db/client";
import { createInvoice, issueInvoice, listInvoices, listPayments, recordVerifiedPayment, voidInvoice } from "@/modules/billing/invoices";
import { listProspects } from "@/modules/crm/prospects";
import { parseMoneyToMinor } from "@/modules/shared/money";
import { requireHqSession } from "@/lib/session";
import { runAction, str } from "@/lib/actions";
import { Badge, Empty, Flash, Money, When, type SearchParams } from "../../ui";

export const metadata = { title: "Invoices and payments" };

async function newInvoice(fd: FormData) {
  "use server";
  await runAction("/app/invoices", async (db, ctx) => {
    const inv = await createInvoice(db, ctx, {
      prospectId: str(fd, "prospectId") ?? "",
      kind: (str(fd, "kind") ?? "other") as "other",
      description: str(fd, "description") ?? "",
      currency: (str(fd, "currency") ?? "GHS") as "GHS",
      amountMinor: parseMoneyToMinor(str(fd, "amount") ?? ""),
    });
    return `Invoice ${inv.number} created as a draft`;
  });
}

async function invoiceStep(fd: FormData) {
  "use server";
  await runAction("/app/invoices", async (db, ctx) => {
    const id = str(fd, "id")!;
    if (str(fd, "step") === "issue") {
      const inv = await issueInvoice(db, ctx, id);
      return `Invoice ${inv.number} issued`;
    }
    const inv = await voidInvoice(db, ctx, id);
    return `Invoice ${inv.number} voided`;
  });
}

async function paymentAction(fd: FormData) {
  "use server";
  await runAction("/app/invoices", async (db, ctx) => {
    const { invoice } = await recordVerifiedPayment(db, ctx, {
      invoiceId: str(fd, "invoiceId") ?? "",
      amountMinor: parseMoneyToMinor(str(fd, "amount") ?? ""),
      currency: (str(fd, "currency") ?? "GHS") as "GHS",
      method: (str(fd, "method") ?? "mobile_money") as "mobile_money",
      reference: str(fd, "reference") ?? "",
      evidence: str(fd, "evidence") ?? "",
      receivedAt: new Date(str(fd, "receivedAt") ?? ""),
    });
    return `Payment recorded. ${invoice.number} is now ${invoice.status.replace("_", " ")}.`;
  });
}

export default async function InvoicesPage({ searchParams }: { searchParams: SearchParams }) {
  const { ctx } = await requireHqSession();
  const db = await getDb();
  const [rows, pays, prospects] = await Promise.all([listInvoices(db, ctx), listPayments(db, ctx), listProspects(db, ctx)]);
  const payable = rows.filter((r) => r.invoice.status === "issued" || r.invoice.status === "partially_paid");
  return (
    <>
      <h1>Invoices and payments</h1>
      <div className="notice small">
        An invoice only becomes paid when a payment is recorded here with a transaction reference and a description of the
        evidence you checked (bank statement line, MoMo confirmation, provider dashboard). There is no other way to mark it paid.
      </div>
      <Flash searchParams={searchParams} />

      {rows.length === 0 ? <Empty>No invoices yet. Deposit invoices are created when a proposal is accepted.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Number</th><th>Customer</th><th>Kind</th><th className="num">Amount</th><th className="num">Paid</th><th>Status</th><th>Due</th><th></th></tr></thead>
            <tbody>
              {rows.map(({ invoice: i, companyName, paidMinor }) => (
                <tr key={i.id}>
                  <td>{i.number}<div className="small muted">{i.description}</div></td>
                  <td><Link href={`/app/prospects/${i.prospectId}`}>{companyName}</Link></td>
                  <td>{i.kind}</td>
                  <td className="num"><Money minor={i.amountMinor} currency={i.currency} /></td>
                  <td className="num"><Money minor={Number(paidMinor)} currency={i.currency} /></td>
                  <td><Badge value={i.status} /></td>
                  <td><When at={i.dueAt} /></td>
                  <td>
                    <form action={invoiceStep} className="inline">
                      <input type="hidden" name="id" value={i.id} />
                      {i.status === "draft" && <button className="small" name="step" value="issue">Issue</button>}
                      {Number(paidMinor) === 0 && i.status !== "void" && <button className="small danger" name="step" value="void">Void</button>}
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid two" style={{ marginTop: "1rem" }}>
        <section className="card">
          <h3 style={{ marginTop: 0 }}>Record a verified payment</h3>
          {payable.length === 0 ? <p className="muted">No issued invoices are waiting for payment.</p> : (
            <form action={paymentAction} className="stack">
              <label>Invoice
                <select name="invoiceId" required>
                  {payable.map(({ invoice: i, companyName, paidMinor }) => (
                    <option key={i.id} value={i.id}>{i.number} · {companyName} · {i.currency} {((i.amountMinor - Number(paidMinor)) / 100).toFixed(2)} outstanding</option>
                  ))}
                </select>
              </label>
              <div className="fields">
                <label>Amount<input name="amount" inputMode="decimal" required /></label>
                <label>Currency<select name="currency"><option>GHS</option><option>USD</option></select></label>
                <label>Method
                  <select name="method"><option value="mobile_money">Mobile money</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="cash">Cash</option><option value="other">Other</option></select>
                </label>
                <label>Transaction reference<input name="reference" required minLength={3} /></label>
                <label>Received on<input name="receivedAt" type="datetime-local" required /></label>
              </div>
              <label>Evidence checked<textarea name="evidence" required minLength={10} placeholder="e.g. Checked MTN MoMo merchant statement: GH₵750 from 024xxxxxxx, ref 123456789, 25 Nov 2026 14:02" /></label>
              <div><button type="submit">Record verified payment</button></div>
            </form>
          )}
        </section>

        <section className="card">
          <h3 style={{ marginTop: 0 }}>Create an invoice</h3>
          {prospects.length === 0 ? <p className="muted">Add a prospect first.</p> : (
            <form action={newInvoice} className="stack">
              <label>Customer
                <select name="prospectId" required>{prospects.map((p) => <option key={p.id} value={p.id}>{p.companyName}</option>)}</select>
              </label>
              <div className="fields">
                <label>Kind<select name="kind"><option>balance</option><option>deposit</option><option>subscription</option><option>other</option></select></label>
                <label>Currency<select name="currency"><option>GHS</option><option>USD</option></select></label>
                <label>Amount<input name="amount" inputMode="decimal" required /></label>
              </div>
              <label>Description<input name="description" required /></label>
              <div><button className="secondary" type="submit">Create draft invoice</button></div>
            </form>
          )}
        </section>
      </div>

      <h2>Payments received</h2>
      {pays.length === 0 ? <Empty>No payments recorded.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Received</th><th>Invoice</th><th className="num">Amount</th><th>Method</th><th>Reference</th><th>Evidence</th></tr></thead>
            <tbody>
              {pays.map(({ payment: p, invoiceNumber }) => (
                <tr key={p.id}>
                  <td><When at={p.receivedAt} /></td>
                  <td>{invoiceNumber}</td>
                  <td className="num"><Money minor={p.amountMinor} currency={p.currency} /></td>
                  <td>{p.method.replace("_", " ")}</td>
                  <td>{p.reference}</td>
                  <td className="small">{p.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
