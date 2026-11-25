import type { ReactNode } from "react";
import { formatMoney, type Currency } from "@/modules/shared/money";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function Flash({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  return (
    <>
      {ok && <div className="flash ok" role="status">{ok}</div>}
      {error && <div className="flash error" role="alert">{error}</div>}
    </>
  );
}

export function Money({ minor, currency }: { minor: number; currency: Currency }) {
  return <span>{formatMoney(minor, currency)}</span>;
}

export function MoneyByCurrency({ value }: { value: Partial<Record<Currency, number>> }) {
  const entries = Object.entries(value).filter(([, v]) => v) as [Currency, number][];
  if (entries.length === 0) return <span>0</span>;
  return (
    <span>
      {entries.map(([c, v], i) => (
        <span key={c}>
          {i > 0 && <br />}
          {formatMoney(v, c)}
        </span>
      ))}
    </span>
  );
}

const TONE: Record<string, "good" | "warn" | "bad" | undefined> = {
  verified: "good", won: "good", paid: "good", approved: "good", sent: "good", done: "good", published: "good", accepted: "good", completed: "good", received: "good",
  unverified: "warn", pending: "warn", pending_approval: "warn", partially_paid: "warn", issued: "warn", blocked: "warn", drafted: "warn", draft: "warn", scheduled: "warn", in_progress: "warn",
  invalid: "bad", lost: "bad", rejected: "bad", void: "bad", failed: "bad", cancelled: "bad", expired: "bad", no_show: "bad",
};

export function Badge({ value }: { value: string }) {
  const tone = TONE[value];
  return <span className={`badge${tone ? ` ${tone}` : ""}`}>{value.replace(/_/g, " ")}</span>;
}

export function Kpi({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className="value">{children}</div>
      {hint && <div className="small muted">{hint}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function When({ at }: { at: Date | string | null | undefined }) {
  if (!at) return <span className="muted">—</span>;
  const d = typeof at === "string" ? new Date(at) : at;
  return <time dateTime={d.toISOString()}>{d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" })}</time>;
}
