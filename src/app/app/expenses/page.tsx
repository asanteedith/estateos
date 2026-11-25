import { getDb } from "@/db/client";
import { listExpenses, recordExpense } from "@/modules/billing/expenses";
import { listApprovals } from "@/modules/ops/approvals";
import { parseMoneyToMinor, formatMoney } from "@/modules/shared/money";
import { requireHqSession } from "@/lib/session";
import { runAction, str } from "@/lib/actions";
import { Empty, Flash, Money, type SearchParams } from "../../ui";

export const metadata = { title: "Expenses" };

async function addExpense(fd: FormData) {
  "use server";
  await runAction("/app/expenses", async (db, ctx) => {
    await recordExpense(db, ctx, {
      description: str(fd, "description") ?? "",
      vendor: str(fd, "vendor"),
      currency: (str(fd, "currency") ?? "USD") as "USD",
      amountMinor: parseMoneyToMinor(str(fd, "amount") ?? ""),
      recurring: (str(fd, "recurring") ?? "none") as "none",
      incurredAt: str(fd, "incurredAt") ?? "",
      approvalId: str(fd, "approvalId") ?? "",
    });
    return "Expense recorded";
  });
}

export default async function ExpensesPage({ searchParams }: { searchParams: SearchParams }) {
  const { ctx } = await requireHqSession();
  const db = await getDb();
  const [rows, approved] = await Promise.all([
    listExpenses(db, ctx),
    listApprovals(db, ctx, "approved").then((r) => r.filter((a) => a.kind === "spend")),
  ]);
  return (
    <>
      <h1>Expenses and subscriptions</h1>
      <p className="small muted">The development budget is zero. A cost can only be recorded against a spend the founder approved.</p>
      <Flash searchParams={searchParams} />
      {rows.length === 0 ? <Empty>No costs recorded. Everything runs on free tiers.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Description</th><th>Vendor</th><th>Recurring</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}><td>{e.incurredAt}</td><td>{e.description}</td><td>{e.vendor ?? "—"}</td><td>{e.recurring}</td><td className="num"><Money minor={e.amountMinor} currency={e.currency} /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <section className="card" style={{ marginTop: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>Record a cost</h3>
        {approved.length === 0 ? (
          <p className="muted">No approved spend yet. Request one on the Approvals page first.</p>
        ) : (
          <form action={addExpense} className="stack">
            <label>Approved spend
              <select name="approvalId" required>
                {approved.map((a) => (
                  <option key={a.id} value={a.id}>{a.title}{a.amountMinor && a.currency ? ` (up to ${formatMoney(a.amountMinor, a.currency)})` : ""}</option>
                ))}
              </select>
            </label>
            <div className="fields">
              <label>Description<input name="description" required /></label>
              <label>Vendor<input name="vendor" /></label>
              <label>Currency<select name="currency"><option>USD</option><option>GHS</option></select></label>
              <label>Amount<input name="amount" inputMode="decimal" required /></label>
              <label>Recurring<select name="recurring"><option>none</option><option>monthly</option><option>yearly</option></select></label>
              <label>Date<input name="incurredAt" type="date" required /></label>
            </div>
            <div><button type="submit">Record cost</button></div>
          </form>
        )}
      </section>
    </>
  );
}
