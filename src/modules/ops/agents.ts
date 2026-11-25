import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { agentTasks, agents } from "@/db/schema";
import { notFound } from "../shared/errors";
import { requireHq, type TenantContext } from "../tenancy/context";
import { logActivity } from "./activity";

/** The nine operating roles of the EstateOS organisation. */
export const HQ_AGENT_ROLES: { key: string; name: string; responsibilities: string[] }[] = [
  {
    key: "ceo",
    name: "CEO / Operations Orchestrator",
    responsibilities: ["Set priorities and assign work", "Review agent output", "Track revenue and costs", "Daily business report"],
  },
  {
    key: "market_intel",
    name: "Market Intelligence",
    responsibilities: ["Research Ghana and international markets", "Competitor and pricing research with source links", "Identify underserved segments"],
  },
  {
    key: "lead_gen",
    name: "Lead Generation",
    responsibilities: ["Find agencies and verified public business contacts", "Score prospects on evidence", "Keep the CRM deduplicated"],
  },
  {
    key: "sales",
    name: "Sales and Business Development",
    responsibilities: ["Personalised outreach via email and WhatsApp", "Follow-ups and qualification", "Demos, proposals and deposits"],
  },
  {
    key: "marketing",
    name: "Marketing and Growth",
    responsibilities: ["Brand, website and landing pages", "SEO and social content", "Campaigns (paid ads disabled until budget approved)"],
  },
  {
    key: "engineering",
    name: "Product and Engineering",
    responsibilities: ["Build and maintain the platform", "Tests, security and documentation", "Deploy when authorised"],
  },
  {
    key: "customer_success",
    name: "Customer Success and Delivery",
    responsibilities: ["Onboarding and requirements", "Configure agency workspaces", "Support and renewals"],
  },
  {
    key: "finance",
    name: "Finance and Administration",
    responsibilities: ["Invoices and payment verification", "Expenses and subscriptions", "Cash-flow forecasts"],
  },
  {
    key: "security",
    name: "Security and Quality",
    responsibilities: ["Code and dependency review", "Tenant isolation testing", "Risk register and release gate"],
  },
];

export async function seedHqAgents(db: Db, tenantId: string) {
  await db
    .insert(agents)
    .values(HQ_AGENT_ROLES.map((r) => ({ tenantId, key: r.key, name: r.name, responsibilities: r.responsibilities })))
    .onConflictDoNothing();
}

export async function listAgents(db: Db, ctx: TenantContext) {
  requireHq(ctx);
  const rows = await db
    .select({
      id: agents.id,
      key: agents.key,
      name: agents.name,
      responsibilities: agents.responsibilities,
      automation: agents.automation,
      openTasks: sql<number>`(select count(*)::int from ${agentTasks} t where t.tenant_id = "agents"."tenant_id" and t.agent_id = "agents"."id" and t.status in ('queued','in_progress','blocked'))`,
    })
    .from(agents)
    .where(eq(agents.tenantId, ctx.tenantId));
  const order = (k: string) => {
    const i = HQ_AGENT_ROLES.findIndex((r) => r.key === k);
    return i === -1 ? 99 : i;
  };
  return rows.sort((a, b) => order(a.key) - order(b.key) || a.name.localeCompare(b.name));
}

export const taskSchema = z.object({
  agentKey: z.string().min(1),
  title: z.string().trim().min(3).max(200),
  detail: z.string().trim().max(4000).optional(),
  priority: z.coerce.number().int().min(1).max(5).default(3),
  dueAt: z.coerce.date().optional(),
});

export async function createTask(db: Db, ctx: TenantContext, input: z.input<typeof taskSchema>) {
  requireHq(ctx);
  const data = taskSchema.parse(input);
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.tenantId, ctx.tenantId), eq(agents.key, data.agentKey)))
    .limit(1);
  if (!agent) throw notFound("Agent");
  const [task] = await db
    .insert(agentTasks)
    .values({ tenantId: ctx.tenantId, agentId: agent.id, title: data.title, detail: data.detail, priority: data.priority, dueAt: data.dueAt })
    .returning();
  await logActivity(db, ctx, { action: "task.created", entityType: "agent_task", entityId: task.id, detail: { agent: agent.key, title: task.title } });
  return task;
}

export type TaskStatus = (typeof agentTasks.$inferSelect)["status"];

export async function updateTaskStatus(db: Db, ctx: TenantContext, taskId: string, status: TaskStatus) {
  requireHq(ctx);
  const [task] = await db
    .update(agentTasks)
    .set({ status, updatedAt: new Date(), completedAt: status === "done" ? new Date() : null })
    .where(and(eq(agentTasks.tenantId, ctx.tenantId), eq(agentTasks.id, taskId)))
    .returning();
  if (!task) throw notFound("Task");
  await logActivity(db, ctx, { action: `task.${status}`, entityType: "agent_task", entityId: task.id, detail: { title: task.title } });
  return task;
}

export async function listTasks(db: Db, ctx: TenantContext, opts: { openOnly?: boolean } = {}) {
  requireHq(ctx);
  const rows = await db
    .select({ task: agentTasks, agentKey: agents.key, agentName: agents.name })
    .from(agentTasks)
    .innerJoin(agents, and(eq(agents.tenantId, agentTasks.tenantId), eq(agents.id, agentTasks.agentId)))
    .where(eq(agentTasks.tenantId, ctx.tenantId))
    .orderBy(asc(agentTasks.priority), asc(agentTasks.createdAt));
  return opts.openOnly ? rows.filter((r) => ["queued", "in_progress", "blocked"].includes(r.task.status)) : rows;
}
