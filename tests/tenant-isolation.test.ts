import { beforeEach, describe, expect, it } from "vitest";
import { prospects, outreach } from "@/db/schema";
import type { Db } from "@/db/client";
import { createProspect, getProspect, listProspects, setStage } from "@/modules/crm/prospects";
import { listOutreach, recordOutreach } from "@/modules/outreach/service";
import { createProposal } from "@/modules/commercial/proposals";
import { createInvoice, listInvoices } from "@/modules/billing/invoices";
import { createListing, listListings, publicAgency, setListingStatus, submitEnquiry, listEnquiries } from "@/modules/listings/service";
import { listAgents, listTasks } from "@/modules/ops/agents";
import { commandCentreMetrics } from "@/modules/dashboard/metrics";
import type { TenantContext } from "@/modules/tenancy/context";
import { freshDb, setupHqAndAgencies } from "./helpers";

let db: Db;
let a: TenantContext;
let b: TenantContext;
let hq: TenantContext;

beforeEach(async () => {
  db = await freshDb();
  ({ a, b, hq } = await setupHqAndAgencies(db));
});

describe("tenant isolation", () => {
  it("one tenant cannot read another tenant's prospects", async () => {
    const p = await createProspect(db, a, { companyName: "Shared Name Realty", website: "sharedname.example" });
    expect(await getProspect(db, b, p.id)).toBeNull();
    expect(await listProspects(db, b)).toHaveLength(0);
    expect(await listProspects(db, a)).toHaveLength(1);
  });

  it("one tenant cannot modify another tenant's prospects", async () => {
    const p = await createProspect(db, a, { companyName: "Target Realty" });
    await expect(setStage(db, b, p.id, "lost")).rejects.toThrow("not found");
    expect((await getProspect(db, a, p.id))?.stage).toBe("new");
  });

  it("the same company may exist in two tenants (dedupe is per tenant)", async () => {
    await createProspect(db, a, { companyName: "Dup Realty", website: "https://dup.example" });
    await expect(createProspect(db, b, { companyName: "Dup Realty", website: "dup.example" })).resolves.toBeTruthy();
  });

  it("services refuse to attach records to another tenant's prospect", async () => {
    const p = await createProspect(db, a, { companyName: "Victim Realty" });
    await expect(recordOutreach(db, b, { prospectId: p.id, channel: "email", direction: "outbound", status: "sent" })).rejects.toThrow(
      "not found",
    );
    await expect(createProposal(db, b, { prospectId: p.id })).rejects.toThrow("not found");
    await expect(
      createInvoice(db, b, { prospectId: p.id, kind: "deposit", description: "x deposit", currency: "GHS", amountMinor: 100 }),
    ).rejects.toThrow("not found");
  });

  it("the database itself rejects cross-tenant references (composite foreign keys)", async () => {
    const p = await createProspect(db, a, { companyName: "Victim Realty" });
    await expect(
      db.insert(outreach).values({ tenantId: b.tenantId, prospectId: p.id, channel: "email", direction: "outbound", status: "sent", createdBy: "x" }),
    ).rejects.toThrow();
  });

  it("lists only include the caller's own outreach and invoices", async () => {
    const pa = await createProspect(db, a, { companyName: "A Lead" });
    await recordOutreach(db, a, { prospectId: pa.id, channel: "email", direction: "outbound", status: "sent" });
    await createInvoice(db, a, { prospectId: pa.id, kind: "other", description: "Setup fee", currency: "GHS", amountMinor: 1000 });
    expect(await listOutreach(db, b)).toHaveLength(0);
    expect(await listInvoices(db, b)).toHaveLength(0);
    expect(await listOutreach(db, a)).toHaveLength(1);
  });

  it("listings and enquiries stay inside their agency", async () => {
    const l = await createListing(db, a, {
      title: "3 bed house, East Legon",
      offerType: "sale",
      propertyType: "house",
      currency: "USD",
      priceMinor: 250_000_00,
      location: "East Legon, Accra",
    });
    expect(await listListings(db, b)).toHaveLength(0);
    // Unpublished listings are not public.
    const tenantA = (await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, a.tenantId) }))!;
    expect((await publicAgency(db, tenantA.slug))?.listings).toHaveLength(0);
    await setListingStatus(db, a, l.id, "published");
    expect((await publicAgency(db, tenantA.slug))?.listings).toHaveLength(1);
    // Cannot enquire about agency A's listing through agency B's page.
    const tenantB = (await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, b.tenantId) }))!;
    await expect(submitEnquiry(db, tenantB.slug, { listingId: l.id, name: "X", email: "x@example.test", message: "Hi there" })).rejects.toThrow(
      "not available",
    );
    await submitEnquiry(db, tenantA.slug, { listingId: l.id, name: "Kofi", phone: "+233200000000", message: "Is it available?" });
    expect(await listEnquiries(db, a)).toHaveLength(1);
    expect(await listEnquiries(db, b)).toHaveLength(0);
  });

  it("the HQ public page is not exposed as an agency page", async () => {
    expect(await publicAgency(db, "estateos-hq")).toBeNull();
  });

  it("Command Centre features are HQ-only", async () => {
    await expect(commandCentreMetrics(db, a)).rejects.toThrow("HQ");
    await expect(listAgents(db, a)).rejects.toThrow("HQ");
    await expect(listTasks(db, b)).rejects.toThrow("HQ");
    await expect(commandCentreMetrics(db, hq)).resolves.toBeTruthy();
  });

  it("HQ metrics do not count agency tenants' CRM data", async () => {
    await createProspect(db, a, { companyName: "Agency-side lead" });
    const m = await commandCentreMetrics(db, hq);
    expect(m.prospectsFound).toBe(0);
    expect(m.agencyWorkspaces).toBe(2);
  });

  it("raw table check: rows are tagged with the creating tenant", async () => {
    await createProspect(db, a, { companyName: "Tagged" });
    const all = await db.select().from(prospects);
    expect(all.every((r) => r.tenantId === a.tenantId)).toBe(true);
  });
});
