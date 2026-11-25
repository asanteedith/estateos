import "server-only";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { getDb, type Db } from "@/db/client";
import { DomainError } from "@/modules/shared/errors";
import type { TenantContext } from "@/modules/tenancy/context";
import { requireSession } from "./session";

/** Converts known errors into a short message for the user. Unknown errors are logged, not shown. */
export function userMessage(e: unknown): string {
  if (e instanceof DomainError) return e.message;
  if (e instanceof ZodError) return e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
  console.error(e);
  return "Something went wrong. Please try again.";
}

function withParam(path: string, key: string, value: string) {
  const [base, q = ""] = path.split("?");
  const params = new URLSearchParams(q);
  params.set(key, value);
  return `${base}?${params.toString()}`;
}

/**
 * Runs a tenant-scoped mutation for the signed-in user, then redirects back
 * with ?ok= or ?error= so the page can show the outcome.
 */
export async function runAction(
  returnTo: string,
  fn: (db: Db, ctx: TenantContext) => Promise<string | void>,
): Promise<never> {
  const { ctx } = await requireSession();
  let target: string;
  try {
    const msg = await fn(await getDb(), ctx);
    target = withParam(returnTo, "ok", msg || "Saved");
  } catch (e) {
    target = withParam(returnTo, "error", userMessage(e));
  }
  revalidatePath(returnTo.split("?")[0]);
  redirect(target);
}

export function str(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

export function bool(fd: FormData, key: string) {
  return fd.get(key) === "on" || fd.get(key) === "true";
}
