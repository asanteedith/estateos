import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { invoices, memberships } from "@/db/schema";
import { createProspect, dedupeKeyFor, getProspect, scoreProspect } from "@/modules/crm/prospects";
import { bookMeeting, markSent, recordOutreach } from "@/modules/outreach/service";
import { acceptProposal, createProposal, markProposalSent } from "@/modules/commercial/proposals";
import { createInvoice, issueInvoice, listInvoices, recordVerifiedPayment, voidInvoice } from "@/modules/billing/invoices";
import { recordExpense } from "@/modules/billing/expenses";
import { decideApproval, listApprovals, requestApproval } from "@/modules/ops/approvals";
import { createTask, listAgents, updateTaskStatus } from "@/modules/ops/agents";
import { commandCentreMetrics, needsAttention } from "@/modules/dashboard/metrics";
import { createObjective } from "@/modules/ops/objectives";
import { objectivesProgress } from "@/modules/dashboard/metrics";
import { parseMoneyToMinor, formatMoney } from "@/modules/shared/money";
import type { TenantContext } from "@/modules/tenancy/context";
import { freshDb, setupHqAndAgencies } from "./helpers";

let db: Db;
let hq: TenantContext;

beforeEach(async () => {
  db = await freshDb();
  ({ hq } = await setupHqAndAgencies(db));
});

const evidence = "MTN MoMo confirmation SMS checked against merchant statement";

describe("prospects", () => {
  it("dedupes on domain and on normalised name", async () => {
    expect(dedupeKeyFor("Acme", "https://www.acme.com.gh/about")).toBe("domain:acme.com.gh");
    expect(dedupeKeyFor("Acme Realty Ltd")).toBe(dedupeKeyFor("acme realty"));
    await createProspect(db, hq, { companyName: "Acme Realty", website: "acme.example" });
    await expect(createProspect(db, hq, { companyName: "ACME Realty Limited", website: "www.acme.example" })).rejects.toThrow(
      "Already in the CRM",
    );
  });

  it("scores only from checked evidence", () => {
    expect(scoreProspect({}).score).toBe(0);
    const s = scoreProspect({ hasActiveListings: true, outdatedOrNoWebsite: true, verifiedBusinessContact: true });
    expect(s.score).toBe(55);
    expect(s.reasons).toHaveLength(3);
  });
});

describe("outreach", () => {
  it("advances the pipeline and blocks duplicate messages", async () => {
    const p = await createProspect(db, hq, { companyName: "Lead One" });
    await recordOutreach(db, hq, { prospectId: p.id, channel: "email", direction: "outbound", status: "sent", externalRef: "gmail-1" });
    expect((await getProspect(db, hq, p.id))?.stage).toBe("contacted");
    await expect(
      recordOutreach(db, hq, { prospectId: p.id, channel: "whatsapp", direction: "outbound", status: "sent" }),
    ).rejects.toThrow("48 hours");
    await expect(
      recordOutreach(db, hq, { prospectId: p.id, channel: "email", direction: "inbound", status: "received", externalRef: "gmail-1" }),
    ).rejects.toThrow("already recorded");
    await recordOutreach(db, hq, { prospectId: p.id, channel: "whatsapp", direction: "outbound", status: "sent", isFollowUp: true });
    await recordOutreach(db, hq, { prospectId: p.id, channel: "email", direction: "inbound", status: "received" });
    expect((await getProspect(db, hq, p.id))?.stage).toBe("replied");
    const attention = await needsAttention(db, hq);
    expect(attention.awaitingReply.map((r) => r.id)).toContain(p.id);
  });

  it("drafts do not count as contacted until marked sent", async () => {
    const p = await createProspect(db, hq, { companyName: "Lead Two" });
    const d = await recordOutreach(db, hq, { prospectId: p.id, channel: "email", direction: "outbound", status: "drafted", subject: "Hi" });
    expect((await commandCentreMetrics(db, hq)).contacted).toBe(0);
    await markSent(db, hq, d.id, "gmail-xyz");
    expect((await commandCentreMetrics(db, hq)).contacted).toBe(1);
    await expect(markSent(db, hq, d.id)).rejects.toThrow("Only drafts");
  });

  it("does not move a won prospect backwards", async () => {
    const p = await createProspect(db, hq, { companyName: "Lead Three" });
    await bookMeeting(db, hq, { prospectId: p.id, scheduledAt: new Date(Date.now() + 86400000) });
    expect((await getProspect(db, hq, p.id))?.stage).toBe("meeting");
    await recordOutreach(db, hq, { prospectId: p.id, channel: "email", direction: "outbound", status: "sent" });
    expect((await getProspect(db, hq, p.id))?.stage).toBe("meeting");
  });
});

describe("proposals and pricing policy", () => {
  it("uses Ghana list price GH₵1,500 with 50% deposit", async () => {
    const p = await createProspect(db, hq, { companyName: "Accra Homes", country: "Ghana" });
    const pr = await createProposal(db, hq, { prospectId: p.id });
    expect(pr.currency).toBe("GHS");
    expect(pr.amountMinor).toBe(150000);
    expect(pr.depositPercent).toBe(50);
    expect(pr.status).toBe("draft");
  });

  it("uses international list price US$750 with 50% deposit", async () => {
    const p = await createProspect(db, hq, { companyName: "London Lets", country: "United Kingdom" });
    const pr = await createProposal(db, hq, { prospectId: p.id });
    expect(pr.currency).toBe("USD");
    expect(pr.amountMinor).toBe(75000);
  });

  it("a discount needs founder approval before it can be sent", async () => {
    const p = await createProspect(db, hq, { companyName: "Discount Realty", country: "GH" });
    const pr = await createProposal(db, hq, { prospectId: p.id, amountMinor: 100000 });
    expect(pr.status).toBe("pending_approval");
    await expect(markProposalSent(db, hq, pr.id)).rejects.toThrow("founder approval");
    const pending = await listApprovals(db, hq, "pending");
    expect(pending).toHaveLength(1);
    await decideApproval(db, hq, pending[0].id, "approved");
    await expect(markProposalSent(db, hq, pr.id)).resolves.toMatchObject({ status: "sent" });
  });

  it("an approval can be decided only once and only by an owner", async () => {
    const ap = await requestApproval(db, hq, { kind: "spend", title: "Domain name", currency: "USD", amountMinor: 1200 });
    await db.update(memberships).set({ role: "admin" }).where(eq(memberships.tenantId, hq.tenantId));
    await expect(decideApproval(db, { ...hq, role: "admin" }, ap.id, "approved")).rejects.toThrow("owner");
    await decideApproval(db, hq, ap.id, "rejected");
    await expect(decideApproval(db, hq, ap.id, "approved")).rejects.toThrow("already been decided");
  });
});

describe("invoices and payments", () => {
  async function acceptedDeal() {
    const p = await createProspect(db, hq, { companyName: "Kumasi Estates", country: "GH" });
    const pr = await createProposal(db, hq, { prospectId: p.id });
    await markProposalSent(db, hq, pr.id);
    const { depositInvoice } = await acceptProposal(db, hq, pr.id);
    return { p, invoice: depositInvoice! };
  }

  it("accepting a proposal raises a 50% deposit invoice", async () => {
    const { invoice, p } = await acceptedDeal();
    expect(invoice.amountMinor).toBe(75000);
    expect(invoice.status).toBe("draft");
    expect((await getProspect(db, hq, p.id))?.stage).toBe("negotiation");
  });

  it("an invoice is never paid without a verified payment with evidence", async () => {
    const { invoice } = await acceptedDeal();
    const base = { invoiceId: invoice.id, amountMinor: 75000, currency: "GHS" as const, method: "mobile_money" as const, receivedAt: new Date() };
    await expect(recordVerifiedPayment(db, hq, { ...base, reference: "MP123456", evidence })).rejects.toThrow("Issue the invoice");
    await issueInvoice(db, hq, invoice.id);
    await expect(recordVerifiedPayment(db, hq, { ...base, reference: "MP123456", evidence: "" })).rejects.toThrow();
    await expect(recordVerifiedPayment(db, hq, { ...base, reference: "", evidence })).rejects.toThrow();
    await expect(recordVerifiedPayment(db, hq, { ...base, currency: "USD", reference: "MP123456", evidence })).rejects.toThrow("currency");
    await expect(recordVerifiedPayment(db, hq, { ...base, amountMinor: 75001, reference: "MP123456", evidence })).rejects.toThrow(
      "more than the outstanding",
    );
    await expect(
      recordVerifiedPayment(db, hq, { ...base, reference: "MP123456", evidence, receivedAt: new Date(Date.now() + 86400000) }),
    ).rejects.toThrow("future");
    await expect(recordVerifiedPayment(db, { ...hq, role: "member" }, { ...base, reference: "MP123456", evidence })).rejects.toThrow("admin");
    const [still] = await db.select().from(invoices).where(eq(invoices.id, invoice.id));
    expect(still.status).toBe("issued");
  });

  it("partial then full payment; deposit paid marks the customer won and counts as revenue", async () => {
    const { invoice, p } = await acceptedDeal();
    await issueInvoice(db, hq, invoice.id);
    const base = { invoiceId: invoice.id, currency: "GHS" as const, method: "mobile_money" as const, receivedAt: new Date(), evidence };
    const r1 = await recordVerifiedPayment(db, hq, { ...base, amountMinor: 25000, reference: "MP-0001" });
    expect(r1.invoice.status).toBe("partially_paid");
    expect((await listInvoices(db, hq))[0].paidMinor).toBe(25000);
    expect((await commandCentreMetrics(db, hq)).outstanding).toEqual({ GHS: 50000 });
    await expect(recordVerifiedPayment(db, hq, { ...base, amountMinor: 100, reference: "MP-0001" })).rejects.toThrow("already recorded");
    const r2 = await recordVerifiedPayment(db, hq, { ...base, amountMinor: 50000, reference: "MP-0002" });
    expect(r2.invoice.status).toBe("paid");
    expect((await getProspect(db, hq, p.id))?.stage).toBe("won");
    await expect(voidInvoice(db, hq, invoice.id)).rejects.toThrow("cannot be voided");
    const m = await commandCentreMetrics(db, hq);
    expect(m.revenueCollected).toEqual({ GHS: 75000 });
    expect(m.customersWon).toBe(1);
    expect(m.outstanding).toEqual({});
  });

  it("there is no code path that sets an invoice to paid directly", async () => {
    const p = await createProspect(db, hq, { companyName: "Manual Co" });
    const inv = await createInvoice(db, hq, { prospectId: p.id, kind: "other", description: "Setup", currency: "USD", amountMinor: 5000 });
    await issueInvoice(db, hq, inv.id);
    const m = await commandCentreMetrics(db, hq);
    expect(m.outstanding).toEqual({ USD: 5000 });
    expect(m.revenueCollected).toEqual({});
    const [row] = await db.select().from(invoices).where(and(eq(invoices.tenantId, hq.tenantId), eq(invoices.id, inv.id)));
    expect(row.status).toBe("issued");
  });
});

describe("costs need approval", () => {
  it("refuses an expense without an approved spend approval of sufficient amount", async () => {
    const input = { description: "Domain", currency: "USD" as const, amountMinor: 1500, incurredAt: "2026-11-25" };
    const ap = await requestApproval(db, hq, { kind: "spend", title: "Buy domain", currency: "USD", amountMinor: 1200 });
    await expect(recordExpense(db, hq, { ...input, approvalId: ap.id })).rejects.toThrow("approved spend");
    await decideApproval(db, hq, ap.id, "approved");
    await expect(recordExpense(db, hq, { ...input, approvalId: ap.id })).rejects.toThrow("larger than");
    await expect(recordExpense(db, hq, { ...input, amountMinor: 1200, approvalId: ap.id })).resolves.toBeTruthy();
    expect((await commandCentreMetrics(db, hq)).expenses).toEqual({ USD: 1200 });
  });
});

describe("agents, tasks and objectives", () => {
  it("lists nine roles, honestly marked manual, and tracks tasks", async () => {
    const list = await listAgents(db, hq);
    expect(list).toHaveLength(9);
    expect(list.every((a) => a.automation === "manual")).toBe(true);
    const t = await createTask(db, hq, { agentKey: "lead_gen", title: "Find 20 Accra agencies" });
    expect((await listAgents(db, hq)).find((a) => a.key === "lead_gen")?.openTasks).toBe(1);
    await updateTaskStatus(db, hq, t.id, "done");
    expect((await listAgents(db, hq)).find((a) => a.key === "lead_gen")?.openTasks).toBe(0);
  });

  it("objectives report progress from real records", async () => {
    await createObjective(db, hq, { title: "First paying customer", metric: "customers", targetValue: 1, dueDate: "2026-11-27" });
    const [o] = await objectivesProgress(db, hq);
    expect(o.current).toBe(0);
  });
});

describe("money", () => {
  it("parses and formats minor units", () => {
    expect(parseMoneyToMinor("1,500")).toBe(150000);
    expect(parseMoneyToMinor("750.5")).toBe(75050);
    expect(() => parseMoneyToMinor("-3")).toThrow();
    expect(formatMoney(150000, "GHS")).toBe("GH₵1,500.00");
  });
});

describe("empty state", () => {
  it("a new HQ shows zeros, not invented numbers", async () => {
    const m = await commandCentreMetrics(db, hq);
    expect(m).toMatchObject({ prospectsFound: 0, contacted: 0, replied: 0, meetingsBooked: 0, proposalsIssued: 0, customersWon: 0, pendingApprovals: 0 });
    expect(m.revenueCollected).toEqual({});
  });
});
