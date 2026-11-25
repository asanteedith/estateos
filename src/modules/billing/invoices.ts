import { and, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { invoices, payments, prospects } from "@/db/schema";
import { conflict, invalid, notFound } from "../shared/errors";
import { requireRole, type TenantContext } from "../tenancy/context";
import { logActivity } from "../ops/activity";
import { requireProspect, setStage } from "../crm/prospects";

export const invoiceSchema = z.object({
  prospectId: z.string().uuid(),
  proposalId: z.string().uuid().optional(),
  kind: z.enum(["deposit", "balance", "subscription", "other"]),
  description: z.string().trim().min(3).max(500),
  currency: z.enum(["GHS", "USD"]),
  amountMinor: z.number().int().positive(),
  dueAt: z.coerce.date().optional(),
});

export async function createInvoice(db: Db, ctx: TenantContext, input: z.input<typeof invoiceSchema>) {
  const data = invoiceSchema.parse(input);
  await requireProspect(db, ctx, data.prospectId);
  const [{ n }] = await db.select({ n: count() }).from(invoices).where(eq(invoices.tenantId, ctx.tenantId));
  const number = `INV-${new Date().getUTCFullYear()}-${String(n + 1).padStart(4, "0")}`;
  const [row] = await db.insert(invoices).values({ tenantId: ctx.tenantId, ...data, number, status: "draft" }).returning();
  await logActivity(db, ctx, { action: "invoice.created", entityType: "invoice", entityId: row.id, detail: { number, amountMinor: row.amountMinor, currency: row.currency } });
  return row;
}

async function requireInvoice(db: Db, ctx: TenantContext, id: string) {
  const [row] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.tenantId, ctx.tenantId), eq(invoices.id, id)))
    .limit(1);
  if (!row) throw notFound("Invoice");
  return row;
}

export async function issueInvoice(db: Db, ctx: TenantContext, id: string, dueInDays = 7) {
  const inv = await requireInvoice(db, ctx, id);
  if (inv.status !== "draft") throw conflict("Only draft invoices can be issued");
  const now = new Date();
  const [row] = await db
    .update(invoices)
    .set({ status: "issued", issuedAt: now, dueAt: inv.dueAt ?? new Date(now.getTime() + dueInDays * 86400000) })
    .where(and(eq(invoices.tenantId, ctx.tenantId), eq(invoices.id, id)))
    .returning();
  await logActivity(db, ctx, { action: "invoice.issued", entityType: "invoice", entityId: id, detail: { number: inv.number } });
  return row;
}

export async function voidInvoice(db: Db, ctx: TenantContext, id: string) {
  requireRole(ctx, "admin");
  const inv = await requireInvoice(db, ctx, id);
  const paid = await paidTotal(db, ctx.tenantId, id);
  if (paid > 0) throw conflict("An invoice with recorded payments cannot be voided");
  if (inv.status === "void") return inv;
  const [row] = await db
    .update(invoices)
    .set({ status: "void" })
    .where(and(eq(invoices.tenantId, ctx.tenantId), eq(invoices.id, id)))
    .returning();
  await logActivity(db, ctx, { action: "invoice.voided", entityType: "invoice", entityId: id });
  return row;
}

async function paidTotal(db: Db, tenantId: string, invoiceId: string) {
  const [{ total }] = await db
    .select({ total: sql<number>`coalesce(sum(${payments.amountMinor}), 0)::int` })
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.invoiceId, invoiceId)));
  return Number(total);
}

export const paymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amountMinor: z.number().int().positive(),
  currency: z.enum(["GHS", "USD"]),
  method: z.enum(["mobile_money", "bank_transfer", "card", "cash", "other"]),
  reference: z.string().trim().min(3, "A transaction reference is required").max(200),
  evidence: z
    .string()
    .trim()
    .min(10, "Describe the evidence you checked (for example the bank statement line or MoMo confirmation)")
    .max(2000),
  receivedAt: z.coerce.date(),
});

/**
 * Records a payment that a person has verified against real evidence. This is the
 * only way an invoice becomes partially_paid or paid. Admin or owner only.
 */
export async function recordVerifiedPayment(db: Db, ctx: TenantContext, input: z.input<typeof paymentSchema>) {
  requireRole(ctx, "admin");
  const data = paymentSchema.parse(input);
  if (data.receivedAt.getTime() > Date.now() + 5 * 60 * 1000) throw invalid("Payment date cannot be in the future");
  const inv = await requireInvoice(db, ctx, data.invoiceId);
  if (inv.status === "draft") throw conflict("Issue the invoice before recording a payment");
  if (inv.status === "void") throw conflict("Cannot record a payment on a void invoice");
  if (data.currency !== inv.currency) throw invalid(`Payment currency must be ${inv.currency}`);
  const already = await paidTotal(db, ctx.tenantId, inv.id);
  const outstanding = inv.amountMinor - already;
  if (outstanding <= 0) throw conflict("This invoice is already paid in full");
  if (data.amountMinor > outstanding) throw invalid("Payment is more than the outstanding balance");

  const [dupe] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.tenantId, ctx.tenantId), eq(payments.method, data.method), eq(payments.reference, data.reference)))
    .limit(1);
  if (dupe) throw conflict("A payment with this reference is already recorded");

  const [payment] = await db
    .insert(payments)
    .values({ tenantId: ctx.tenantId, ...data, verifiedByUserId: ctx.userId, verifiedAt: new Date() })
    .returning();
  const newTotal = already + data.amountMinor;
  const status = newTotal >= inv.amountMinor ? "paid" : "partially_paid";
  const [invoice] = await db
    .update(invoices)
    .set({ status })
    .where(and(eq(invoices.tenantId, ctx.tenantId), eq(invoices.id, inv.id)))
    .returning();
  if (status === "paid" && inv.kind === "deposit") await setStage(db, ctx, inv.prospectId, "won");
  await logActivity(db, ctx, {
    action: "payment.verified",
    entityType: "invoice",
    entityId: inv.id,
    detail: { amountMinor: data.amountMinor, currency: data.currency, method: data.method, reference: data.reference },
  });
  return { payment, invoice };
}

export async function listInvoices(db: Db, ctx: TenantContext) {
  return db
    .select({
      invoice: invoices,
      companyName: prospects.companyName,
      paidMinor: sql<number>`(select coalesce(sum(p.amount_minor),0)::int from ${payments} p where p.tenant_id = "invoices"."tenant_id" and p.invoice_id = "invoices"."id")`,
    })
    .from(invoices)
    .innerJoin(prospects, and(eq(prospects.tenantId, invoices.tenantId), eq(prospects.id, invoices.prospectId)))
    .where(eq(invoices.tenantId, ctx.tenantId))
    .orderBy(desc(invoices.createdAt))
    .limit(500);
}

export async function listPayments(db: Db, ctx: TenantContext) {
  return db
    .select({ payment: payments, invoiceNumber: invoices.number })
    .from(payments)
    .innerJoin(invoices, and(eq(invoices.tenantId, payments.tenantId), eq(invoices.id, payments.invoiceId)))
    .where(eq(payments.tenantId, ctx.tenantId))
    .orderBy(desc(payments.receivedAt))
    .limit(500);
}
