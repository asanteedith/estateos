import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { meetings, outreach, prospects } from "@/db/schema";
import { conflict, notFound } from "../shared/errors";
import { actorLabel, type TenantContext } from "../tenancy/context";
import { logActivity } from "../ops/activity";
import { advanceStage, requireProspect } from "../crm/prospects";

/** Minimum gap between two outbound messages to the same prospect, unless marked as a planned follow-up. */
export const MIN_OUTBOUND_GAP_MS = 1000 * 60 * 60 * 48;

export const outreachSchema = z.object({
  prospectId: z.string().uuid(),
  channel: z.enum(["email", "whatsapp", "phone", "in_person", "other"]),
  direction: z.enum(["outbound", "inbound"]),
  status: z.enum(["drafted", "sent", "failed", "received"]),
  subject: z.string().trim().max(300).optional(),
  body: z.string().trim().max(20000).optional(),
  externalRef: z.string().trim().max(300).optional(),
  campaign: z.string().trim().max(100).optional(),
  occurredAt: z.coerce.date().optional(),
  /** Set when a second outbound inside the gap is an intentional follow-up. */
  isFollowUp: z.boolean().default(false),
});

/**
 * Records a message. Guards against duplicate outreach:
 * - the same external message id is never stored twice;
 * - a new outbound "sent" within 48h of a previous one is refused unless it is a follow-up.
 */
export async function recordOutreach(db: Db, ctx: TenantContext, input: z.input<typeof outreachSchema>) {
  const data = outreachSchema.parse(input);
  if (data.direction === "inbound" && data.status !== "received") throw conflict("Inbound messages must have status 'received'");
  if (data.direction === "outbound" && data.status === "received") throw conflict("Outbound messages cannot be 'received'");
  await requireProspect(db, ctx, data.prospectId);

  if (data.externalRef) {
    const [dupe] = await db
      .select({ id: outreach.id })
      .from(outreach)
      .where(and(eq(outreach.tenantId, ctx.tenantId), eq(outreach.externalRef, data.externalRef)))
      .limit(1);
    if (dupe) throw conflict("This message is already recorded");
  }
  const occurredAt = data.occurredAt ?? (data.status === "drafted" ? undefined : new Date());
  if (data.direction === "outbound" && data.status === "sent" && !data.isFollowUp) {
    const since = new Date((occurredAt ?? new Date()).getTime() - MIN_OUTBOUND_GAP_MS);
    const [recent] = await db
      .select({ id: outreach.id })
      .from(outreach)
      .where(
        and(
          eq(outreach.tenantId, ctx.tenantId),
          eq(outreach.prospectId, data.prospectId),
          eq(outreach.direction, "outbound"),
          eq(outreach.status, "sent"),
          gte(outreach.occurredAt, since),
        ),
      )
      .limit(1);
    if (recent) throw conflict("This prospect was already messaged in the last 48 hours. Mark it as a follow-up if intended.");
  }

  const { isFollowUp: _ignored, ...values } = data;
  const [row] = await db
    .insert(outreach)
    .values({ tenantId: ctx.tenantId, ...values, occurredAt, createdBy: actorLabel(ctx) })
    .returning();

  if (row.direction === "outbound" && row.status === "sent") await advanceStage(db, ctx, row.prospectId, "contacted");
  if (row.direction === "inbound") await advanceStage(db, ctx, row.prospectId, "replied");
  await logActivity(db, ctx, {
    action: `outreach.${row.direction}.${row.status}`,
    entityType: "prospect",
    entityId: row.prospectId,
    detail: { channel: row.channel, subject: row.subject },
  });
  return row;
}

/** Marks a drafted message as sent once it has actually gone out through a connected account. */
export async function markSent(db: Db, ctx: TenantContext, outreachId: string, externalRef?: string) {
  const [draft] = await db
    .select()
    .from(outreach)
    .where(and(eq(outreach.tenantId, ctx.tenantId), eq(outreach.id, outreachId)))
    .limit(1);
  if (!draft) throw notFound("Message");
  if (draft.status !== "drafted") throw conflict("Only drafts can be marked as sent");
  const [row] = await db
    .update(outreach)
    .set({ status: "sent", occurredAt: new Date(), externalRef: externalRef || draft.externalRef })
    .where(and(eq(outreach.tenantId, ctx.tenantId), eq(outreach.id, outreachId)))
    .returning();
  await advanceStage(db, ctx, row.prospectId, "contacted");
  await logActivity(db, ctx, { action: "outreach.outbound.sent", entityType: "prospect", entityId: row.prospectId, detail: { channel: row.channel } });
  return row;
}

export async function listOutreach(db: Db, ctx: TenantContext, prospectId?: string) {
  const where = prospectId
    ? and(eq(outreach.tenantId, ctx.tenantId), eq(outreach.prospectId, prospectId))
    : eq(outreach.tenantId, ctx.tenantId);
  return db
    .select({ message: outreach, companyName: prospects.companyName })
    .from(outreach)
    .innerJoin(prospects, and(eq(prospects.tenantId, outreach.tenantId), eq(prospects.id, outreach.prospectId)))
    .where(where)
    .orderBy(desc(outreach.createdAt))
    .limit(500);
}

/** Has this prospect been contacted before on any channel? Check before any new outreach. */
export async function outreachHistory(db: Db, ctx: TenantContext, prospectId: string) {
  return db
    .select()
    .from(outreach)
    .where(
      and(
        eq(outreach.tenantId, ctx.tenantId),
        eq(outreach.prospectId, prospectId),
        inArray(outreach.status, ["sent", "received"]),
      ),
    )
    .orderBy(desc(outreach.occurredAt));
}

export const meetingSchema = z.object({
  prospectId: z.string().uuid(),
  kind: z.enum(["discovery", "demo", "onboarding", "review"]).default("demo"),
  scheduledAt: z.coerce.date(),
  location: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(4000).optional(),
});

export async function bookMeeting(db: Db, ctx: TenantContext, input: z.input<typeof meetingSchema>) {
  const data = meetingSchema.parse(input);
  await requireProspect(db, ctx, data.prospectId);
  const [row] = await db.insert(meetings).values({ tenantId: ctx.tenantId, ...data }).returning();
  await advanceStage(db, ctx, data.prospectId, "meeting");
  await logActivity(db, ctx, { action: "meeting.booked", entityType: "prospect", entityId: data.prospectId, detail: { kind: row.kind, at: row.scheduledAt.toISOString() } });
  return row;
}

export async function setMeetingStatus(db: Db, ctx: TenantContext, id: string, status: "scheduled" | "completed" | "cancelled" | "no_show") {
  const [row] = await db
    .update(meetings)
    .set({ status })
    .where(and(eq(meetings.tenantId, ctx.tenantId), eq(meetings.id, id)))
    .returning();
  if (!row) throw notFound("Meeting");
  await logActivity(db, ctx, { action: `meeting.${status}`, entityType: "prospect", entityId: row.prospectId });
  return row;
}

export async function listMeetings(db: Db, ctx: TenantContext) {
  return db
    .select({ meeting: meetings, companyName: prospects.companyName })
    .from(meetings)
    .innerJoin(prospects, and(eq(prospects.tenantId, meetings.tenantId), eq(prospects.id, meetings.prospectId)))
    .where(eq(meetings.tenantId, ctx.tenantId))
    .orderBy(desc(meetings.scheduledAt))
    .limit(500);
}
