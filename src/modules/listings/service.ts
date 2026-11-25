import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { enquiries, listings, tenants } from "@/db/schema";
import { invalid, notFound } from "../shared/errors";
import type { TenantContext } from "../tenancy/context";
import { logActivity } from "../ops/activity";

export const listingSchema = z.object({
  title: z.string().trim().min(3).max(200),
  offerType: z.enum(["sale", "rent"]),
  propertyType: z.enum(["house", "apartment", "land", "commercial", "other"]),
  currency: z.enum(["GHS", "USD"]),
  priceMinor: z.number().int().min(0),
  location: z.string().trim().min(2).max(200),
  bedrooms: z.number().int().min(0).max(100).optional(),
  bathrooms: z.number().int().min(0).max(100).optional(),
  description: z.string().trim().max(10000).optional(),
});

export async function createListing(db: Db, ctx: TenantContext, input: z.input<typeof listingSchema>) {
  const data = listingSchema.parse(input);
  const [row] = await db.insert(listings).values({ tenantId: ctx.tenantId, ...data }).returning();
  await logActivity(db, ctx, { action: "listing.created", entityType: "listing", entityId: row.id, detail: { title: row.title } });
  return row;
}

export async function setListingStatus(db: Db, ctx: TenantContext, id: string, status: "draft" | "published" | "archived") {
  const [row] = await db
    .update(listings)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(listings.tenantId, ctx.tenantId), eq(listings.id, id)))
    .returning();
  if (!row) throw notFound("Listing");
  await logActivity(db, ctx, { action: `listing.${status}`, entityType: "listing", entityId: id });
  return row;
}

export async function listListings(db: Db, ctx: TenantContext) {
  return db.select().from(listings).where(eq(listings.tenantId, ctx.tenantId)).orderBy(desc(listings.createdAt)).limit(500);
}

export async function listEnquiries(db: Db, ctx: TenantContext) {
  return db
    .select({ enquiry: enquiries, listingTitle: listings.title })
    .from(enquiries)
    .leftJoin(listings, and(eq(listings.tenantId, enquiries.tenantId), eq(listings.id, enquiries.listingId)))
    .where(eq(enquiries.tenantId, ctx.tenantId))
    .orderBy(desc(enquiries.createdAt))
    .limit(500);
}

export async function setEnquiryStatus(db: Db, ctx: TenantContext, id: string, status: "new" | "contacted" | "qualified" | "closed") {
  const [row] = await db
    .update(enquiries)
    .set({ status })
    .where(and(eq(enquiries.tenantId, ctx.tenantId), eq(enquiries.id, id)))
    .returning();
  if (!row) throw notFound("Enquiry");
  return row;
}

/* ------------------------ Public (no login) ------------------------ */

export async function publicAgency(db: Db, slug: string) {
  const [tenant] = await db
    .select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
    .from(tenants)
    .where(and(eq(tenants.slug, slug), eq(tenants.kind, "agency")))
    .limit(1);
  if (!tenant) return null;
  const items = await db
    .select()
    .from(listings)
    .where(and(eq(listings.tenantId, tenant.id), eq(listings.status, "published")))
    .orderBy(desc(listings.createdAt))
    .limit(200);
  return { tenant, listings: items };
}

export const enquirySchema = z
  .object({
    listingId: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(200),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email()
      .max(254)
      .optional()
      .or(z.literal("").transform(() => undefined)),
    phone: z
      .string()
      .trim()
      .max(40)
      .optional()
      .transform((v) => v || undefined),
    message: z.string().trim().min(2).max(4000),
  })
  .refine((v) => v.email || v.phone, { message: "Give an email or a phone number" });

/** Public enquiry from an agency's listings page. The listing must be published and belong to that agency. */
export async function submitEnquiry(db: Db, agencySlug: string, input: z.input<typeof enquirySchema>) {
  const data = enquirySchema.parse(input);
  const agency = await publicAgency(db, agencySlug);
  if (!agency) throw notFound("Agency");
  if (data.listingId && !agency.listings.some((l) => l.id === data.listingId)) throw invalid("That listing is not available");
  const [row] = await db.insert(enquiries).values({ tenantId: agency.tenant.id, ...data }).returning();
  return row;
}
