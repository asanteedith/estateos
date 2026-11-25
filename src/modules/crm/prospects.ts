import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { PROSPECT_STAGES, prospects } from "@/db/schema";
import { conflict, notFound } from "../shared/errors";
import type { TenantContext } from "../tenancy/context";
import { logActivity } from "../ops/activity";

/** Lower-cased registrable host ("www.acme.com.gh/x" -> "acme.com.gh"), or the normalised name. */
export function dedupeKeyFor(companyName: string, website?: string | null) {
  if (website) {
    try {
      const url = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      if (host.includes(".")) return `domain:${host}`;
    } catch {
      /* fall through to name */
    }
  }
  const name = companyName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\b(ltd|limited|llc|inc|plc|co|company|gh|ghana)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
  return `name:${name}`;
}

/**
 * Evidence-based fit score. Each signal must be something a person checked
 * (for example by opening the agency's website). Returns 0-100 plus the reasons.
 */
export const scoringSignalsSchema = z.object({
  hasActiveListings: z.boolean().default(false),
  noOnlineEnquiryForm: z.boolean().default(false),
  outdatedOrNoWebsite: z.boolean().default(false),
  decisionMakerIdentified: z.boolean().default(false),
  verifiedBusinessContact: z.boolean().default(false),
  inTargetMarket: z.boolean().default(false),
  activeOnSocial: z.boolean().default(false),
});
export type ScoringSignals = z.infer<typeof scoringSignalsSchema>;

const WEIGHTS: Record<keyof ScoringSignals, [number, string]> = {
  hasActiveListings: [20, "Has active property listings (can pay, has stock to market)"],
  noOnlineEnquiryForm: [15, "No working online enquiry capture"],
  outdatedOrNoWebsite: [20, "Website is missing or outdated"],
  decisionMakerIdentified: [15, "Decision-maker publicly identified"],
  verifiedBusinessContact: [15, "Verified business contact channel"],
  inTargetMarket: [10, "In a target market"],
  activeOnSocial: [5, "Active on social media (reachable, values marketing)"],
};

export function scoreProspect(signals: Partial<ScoringSignals>) {
  const s = scoringSignalsSchema.parse(signals);
  let score = 0;
  const reasons: string[] = [];
  for (const [k, [w, label]] of Object.entries(WEIGHTS) as [keyof ScoringSignals, [number, string]][]) {
    if (s[k]) {
      score += w;
      reasons.push(label);
    }
  }
  return { score: Math.min(100, score), reasons };
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const prospectSchema = z.object({
  companyName: z.string().trim().min(2).max(200),
  website: optionalText(500),
  country: optionalText(60),
  city: optionalText(100),
  segment: optionalText(100),
  contactName: optionalText(200),
  contactRole: optionalText(100),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .max(254)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  phone: optionalText(40),
  whatsapp: optionalText(40),
  sourceUrl: z
    .string()
    .trim()
    .url()
    .max(1000)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  sourceNote: optionalText(1000),
  notes: optionalText(4000),
});

export async function createProspect(
  db: Db,
  ctx: TenantContext,
  input: z.input<typeof prospectSchema>,
  signals?: Partial<ScoringSignals>,
) {
  const data = prospectSchema.parse(input);
  const dedupeKey = dedupeKeyFor(data.companyName, data.website);
  const [dupe] = await db
    .select({ id: prospects.id, companyName: prospects.companyName })
    .from(prospects)
    .where(and(eq(prospects.tenantId, ctx.tenantId), eq(prospects.dedupeKey, dedupeKey)))
    .limit(1);
  if (dupe) throw conflict(`Already in the CRM as "${dupe.companyName}"`);
  const scored = signals ? scoreProspect(signals) : null;
  const [row] = await db
    .insert(prospects)
    .values({
      tenantId: ctx.tenantId,
      ...data,
      dedupeKey,
      fitScore: scored?.score ?? null,
      scoreReasons: scored?.reasons ?? null,
    })
    .returning();
  await logActivity(db, ctx, { action: "prospect.created", entityType: "prospect", entityId: row.id, detail: { company: row.companyName } });
  return row;
}

export async function getProspect(db: Db, ctx: TenantContext, id: string) {
  const [row] = await db
    .select()
    .from(prospects)
    .where(and(eq(prospects.tenantId, ctx.tenantId), eq(prospects.id, id)))
    .limit(1);
  return row ?? null;
}

export async function requireProspect(db: Db, ctx: TenantContext, id: string) {
  const row = await getProspect(db, ctx, id);
  if (!row) throw notFound("Prospect");
  return row;
}

export async function listProspects(db: Db, ctx: TenantContext, opts: { q?: string; stage?: string } = {}) {
  const conds = [eq(prospects.tenantId, ctx.tenantId)];
  if (opts.stage && (PROSPECT_STAGES as readonly string[]).includes(opts.stage)) {
    conds.push(eq(prospects.stage, opts.stage as (typeof PROSPECT_STAGES)[number]));
  }
  if (opts.q) {
    const q = `%${opts.q.replace(/[%_\\]/g, (m) => `\\${m}`).slice(0, 100)}%`;
    conds.push(or(ilike(prospects.companyName, q), ilike(prospects.city, q), ilike(prospects.contactName, q))!);
  }
  return db
    .select()
    .from(prospects)
    .where(and(...conds))
    .orderBy(sql`${prospects.fitScore} DESC NULLS LAST`, desc(prospects.createdAt))
    .limit(500);
}

export type Stage = (typeof PROSPECT_STAGES)[number];

export async function setStage(db: Db, ctx: TenantContext, id: string, stage: Stage) {
  if (!(PROSPECT_STAGES as readonly string[]).includes(stage)) throw conflict("Unknown stage");
  const [row] = await db
    .update(prospects)
    .set({ stage, updatedAt: new Date() })
    .where(and(eq(prospects.tenantId, ctx.tenantId), eq(prospects.id, id)))
    .returning();
  if (!row) throw notFound("Prospect");
  await logActivity(db, ctx, { action: "prospect.stage_changed", entityType: "prospect", entityId: id, detail: { stage } });
  return row;
}

const STAGE_ORDER = Object.fromEntries(PROSPECT_STAGES.map((s, i) => [s, i])) as Record<Stage, number>;

/** Moves a prospect forward to `stage` only if it is currently earlier in the funnel (never backwards, never out of won/lost). */
export async function advanceStage(db: Db, ctx: TenantContext, id: string, stage: Stage) {
  const p = await requireProspect(db, ctx, id);
  if (p.stage === "won" || p.stage === "lost") return p;
  if (STAGE_ORDER[p.stage] >= STAGE_ORDER[stage]) return p;
  return setStage(db, ctx, id, stage);
}

export async function setVerification(db: Db, ctx: TenantContext, id: string, status: "verified" | "invalid" | "unverified") {
  const [row] = await db
    .update(prospects)
    .set({ verificationStatus: status, verifiedAt: status === "verified" ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(prospects.tenantId, ctx.tenantId), eq(prospects.id, id)))
    .returning();
  if (!row) throw notFound("Prospect");
  await logActivity(db, ctx, { action: `prospect.${status}`, entityType: "prospect", entityId: id });
  return row;
}

export async function rescoreProspect(db: Db, ctx: TenantContext, id: string, signals: Partial<ScoringSignals>) {
  const { score, reasons } = scoreProspect(signals);
  const [row] = await db
    .update(prospects)
    .set({ fitScore: score, scoreReasons: reasons, updatedAt: new Date() })
    .where(and(eq(prospects.tenantId, ctx.tenantId), eq(prospects.id, id)))
    .returning();
  if (!row) throw notFound("Prospect");
  return row;
}

export async function pipelineBoard(db: Db, ctx: TenantContext) {
  const rows = await db
    .select({ id: prospects.id, companyName: prospects.companyName, city: prospects.city, country: prospects.country, stage: prospects.stage, fitScore: prospects.fitScore })
    .from(prospects)
    .where(eq(prospects.tenantId, ctx.tenantId))
    .orderBy(asc(prospects.companyName));
  return PROSPECT_STAGES.map((stage) => ({ stage, items: rows.filter((r) => r.stage === stage) }));
}
