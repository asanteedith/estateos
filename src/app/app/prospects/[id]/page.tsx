import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { PROSPECT_STAGES } from "@/db/schema";
import { getProspect, rescoreProspect, setStage, setVerification, type Stage } from "@/modules/crm/prospects";
import { bookMeeting, listMeetings, listOutreach, markSent, recordOutreach } from "@/modules/outreach/service";
import { createProposal, listProposals } from "@/modules/commercial/proposals";
import { marketFor, policyFor } from "@/modules/commercial/pricing";
import { listActivityFor } from "@/modules/ops/activity";
import { parseMoneyToMinor, formatMoney } from "@/modules/shared/money";
import { requireHqSession } from "@/lib/session";
import { bool, runAction, str } from "@/lib/actions";
import { Badge, Empty, Flash, Money, When, type SearchParams } from "../../../ui";
import { SignalFields } from "../signals";

type Params = Promise<{ id: string }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function stageAction(fd: FormData) {
  "use server";
  const id = str(fd, "id")!;
  await runAction(`/app/prospects/${id}`, async (db, ctx) => {
    await setStage(db, ctx, id, str(fd, "stage") as Stage);
    return "Stage updated";
  });
}

async function verifyAction(fd: FormData) {
  "use server";
  const id = str(fd, "id")!;
  await runAction(`/app/prospects/${id}`, async (db, ctx) => {
    await setVerification(db, ctx, id, str(fd, "status") as "verified" | "invalid" | "unverified");
    return "Verification updated";
  });
}

async function rescoreAction(fd: FormData) {
  "use server";
  const id = str(fd, "id")!;
  await runAction(`/app/prospects/${id}`, async (db, ctx) => {
    const keys = ["hasActiveListings", "noOnlineEnquiryForm", "outdatedOrNoWebsite", "decisionMakerIdentified", "verifiedBusinessContact", "inTargetMarket", "activeOnSocial"] as const;
    const signals = Object.fromEntries(keys.map((k) => [k, bool(fd, k)]));
    const p = await rescoreProspect(db, ctx, id, signals);
    return `Fit score is now ${p.fitScore}`;
  });
}

async function outreachAction(fd: FormData) {
  "use server";
  const id = str(fd, "prospectId")!;
  await runAction(`/app/prospects/${id}`, async (db, ctx) => {
    const kind = str(fd, "kind");
    const direction = kind === "inbound" ? "inbound" : "outbound";
    const status = kind === "inbound" ? "received" : kind === "draft" ? "drafted" : "sent";
    const occurred = str(fd, "occurredAt");
    await recordOutreach(db, ctx, {
      prospectId: id,
      channel: (str(fd, "channel") ?? "email") as "email",
      direction,
      status,
      subject: str(fd, "subject"),
      body: str(fd, "body"),
      externalRef: str(fd, "externalRef"),
      campaign: str(fd, "campaign"),
      occurredAt: occurred ? new Date(occurred) : undefined,
      isFollowUp: bool(fd, "isFollowUp"),
    });
    return status === "drafted" ? "Draft saved" : "Message recorded";
  });
}

async function markSentAction(fd: FormData) {
  "use server";
  const id = str(fd, "prospectId")!;
  await runAction(`/app/prospects/${id}`, async (db, ctx) => {
    await markSent(db, ctx, str(fd, "outreachId")!, str(fd, "externalRef"));
    return "Marked as sent";
  });
}

async function meetingAction(fd: FormData) {
  "use server";
  const id = str(fd, "prospectId")!;
  await runAction(`/app/prospects/${id}`, async (db, ctx) => {
    await bookMeeting(db, ctx, {
      prospectId: id,
      kind: (str(fd, "kind") ?? "demo") as "demo",
      scheduledAt: new Date(str(fd, "scheduledAt") ?? ""),
      location: str(fd, "location"),
      notes: str(fd, "notes"),
    });
    return "Meeting booked";
  });
}

async function proposalAction(fd: FormData) {
  "use server";
  const id = str(fd, "prospectId")!;
  await runAction(`/app/prospects/${id}`, async (db, ctx) => {
    const amount = str(fd, "amount");
    const deposit = str(fd, "depositPercent");
    const p = await createProposal(db, ctx, {
      prospectId: id,
      title: str(fd, "title"),
      amountMinor: amount ? parseMoneyToMinor(amount) : undefined,
      depositPercent: deposit ? Number(deposit) : undefined,
      scope: str(fd, "scope"),
    });
    return p.status === "pending_approval"
      ? `Proposal ${p.number} is below policy and is waiting for founder approval`
      : `Proposal ${p.number} created`;
  });
}

export default async function ProspectPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { ctx } = await requireHqSession();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const db = await getDb();
  const p = await getProspect(db, ctx, id);
  if (!p) notFound();
  const [messages, meetingRows, proposalRows, activity] = await Promise.all([
    listOutreach(db, ctx, id),
    listMeetings(db, ctx).then((r) => r.filter((m) => m.meeting.prospectId === id)),
    listProposals(db, ctx).then((r) => r.filter((x) => x.proposal.prospectId === id)),
    listActivityFor(db, ctx, id),
  ]);
  const policy = policyFor(marketFor(p.country));

  return (
    <>
      <p className="small"><Link href="/app/prospects">← Prospects</Link></p>
      <div className="page-head">
        <div>
          <h1>{p.companyName}</h1>
          <div><Badge value={p.stage} /> <Badge value={p.verificationStatus} /> {p.fitScore != null && <span className="badge">fit {p.fitScore}</span>}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <form action={stageAction} className="inline">
            <input type="hidden" name="id" value={p.id} />
            <select name="stage" defaultValue={p.stage}>{PROSPECT_STAGES.map((s) => <option key={s}>{s}</option>)}</select>
            <button className="secondary small" type="submit">Set stage</button>
          </form>
          <form action={verifyAction} className="inline">
            <input type="hidden" name="id" value={p.id} />
            <select name="status" defaultValue={p.verificationStatus}>
              <option value="verified">verified</option><option value="unverified">unverified</option><option value="invalid">invalid</option>
            </select>
            <button className="secondary small" type="submit">Set verification</button>
          </form>
        </div>
      </div>
      <Flash searchParams={searchParams} />

      <div className="grid two">
        <section className="card">
          <h3 style={{ marginTop: 0 }}>Details</h3>
          <dl className="small" style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "4px 10px", margin: 0 }}>
            <dt className="muted">Website</dt><dd>{p.website ? <a href={p.website.startsWith("http") ? p.website : `https://${p.website}`} rel="noopener noreferrer" target="_blank">{p.website}</a> : "—"}</dd>
            <dt className="muted">Location</dt><dd>{[p.city, p.country].filter(Boolean).join(", ") || "—"}</dd>
            <dt className="muted">Segment</dt><dd>{p.segment ?? "—"}</dd>
            <dt className="muted">Contact</dt><dd>{p.contactName ?? "—"}{p.contactRole ? `, ${p.contactRole}` : ""}</dd>
            <dt className="muted">Email</dt><dd>{p.email ?? "—"}</dd>
            <dt className="muted">Phone</dt><dd>{p.phone ?? "—"}</dd>
            <dt className="muted">WhatsApp</dt><dd>{p.whatsapp ?? "—"}</dd>
            <dt className="muted">Source</dt><dd>{p.sourceUrl ? <a href={p.sourceUrl} rel="noopener noreferrer" target="_blank">{p.sourceUrl}</a> : <span className="badge warn">no source</span>} {p.sourceNote}</dd>
            <dt className="muted">Added</dt><dd><When at={p.createdAt} /></dd>
          </dl>
          {p.notes && <p style={{ whiteSpace: "pre-wrap", marginTop: "0.75rem" }}>{p.notes}</p>}
          {p.scoreReasons && p.scoreReasons.length > 0 && (
            <>
              <h3>Why this fit score</h3>
              <ul className="small">{p.scoreReasons.map((r) => <li key={r}>{r}</li>)}</ul>
            </>
          )}
          <details>
            <summary className="small">Re-score</summary>
            <form action={rescoreAction} className="stack" style={{ marginTop: 8 }}>
              <input type="hidden" name="id" value={p.id} />
              <SignalFields />
              <div><button className="secondary small" type="submit">Save score</button></div>
            </form>
          </details>
        </section>

        <section className="card">
          <h3 style={{ marginTop: 0 }}>Record a message</h3>
          {messages.filter((m) => m.message.status !== "drafted").length > 0 && (
            <div className="notice small">Already contacted before. Check the history below before sending anything new.</div>
          )}
          <form action={outreachAction} className="stack">
            <input type="hidden" name="prospectId" value={p.id} />
            <div className="fields">
              <label>Type
                <select name="kind">
                  <option value="sent">Outbound: sent</option>
                  <option value="draft">Outbound: draft (not sent yet)</option>
                  <option value="inbound">Inbound: they replied</option>
                </select>
              </label>
              <label>Channel
                <select name="channel"><option>email</option><option>whatsapp</option><option>phone</option><option value="in_person">in person</option><option>other</option></select>
              </label>
              <label>When<input name="occurredAt" type="datetime-local" /></label>
              <label>Message ID (Gmail id, etc.)<input name="externalRef" /></label>
              <label>Campaign<input name="campaign" /></label>
            </div>
            <label>Subject<input name="subject" /></label>
            <label>Message<textarea name="body" /></label>
            <label className="check"><input type="checkbox" name="isFollowUp" /> This is a planned follow-up</label>
            <div><button type="submit">Save</button></div>
          </form>
        </section>
      </div>

      <h2>Outreach history</h2>
      {messages.length === 0 ? <Empty>No messages recorded.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Channel</th><th>Direction</th><th>Status</th><th>Subject / message</th><th></th></tr></thead>
            <tbody>
              {messages.map(({ message: m }) => (
                <tr key={m.id}>
                  <td><When at={m.occurredAt ?? m.createdAt} /></td>
                  <td>{m.channel}</td>
                  <td>{m.direction}</td>
                  <td><Badge value={m.status} /></td>
                  <td>{m.subject && <strong>{m.subject}</strong>}<div className="small" style={{ whiteSpace: "pre-wrap" }}>{m.body?.slice(0, 400)}</div></td>
                  <td>
                    {m.status === "drafted" && (
                      <form action={markSentAction} className="inline">
                        <input type="hidden" name="prospectId" value={p.id} />
                        <input type="hidden" name="outreachId" value={m.id} />
                        <input name="externalRef" placeholder="Message ID" style={{ width: 120 }} />
                        <button className="small" type="submit">Mark sent</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid two" style={{ marginTop: "1rem" }}>
        <section className="card">
          <h3 style={{ marginTop: 0 }}>Meetings</h3>
          {meetingRows.length === 0 ? <p className="muted">None yet.</p> : (
            <ul className="plain">{meetingRows.map(({ meeting: m }) => <li key={m.id}><When at={m.scheduledAt} /> · {m.kind} <Badge value={m.status} /></li>)}</ul>
          )}
          <form action={meetingAction} className="stack" style={{ marginTop: 8 }}>
            <input type="hidden" name="prospectId" value={p.id} />
            <div className="fields">
              <label>Type<select name="kind"><option>demo</option><option>discovery</option><option>onboarding</option><option>review</option></select></label>
              <label>Date and time<input name="scheduledAt" type="datetime-local" required /></label>
              <label>Where / link<input name="location" /></label>
            </div>
            <div><button className="secondary" type="submit">Book meeting</button></div>
          </form>
        </section>

        <section className="card">
          <h3 style={{ marginTop: 0 }}>Proposals</h3>
          {proposalRows.length === 0 ? <p className="muted">None yet.</p> : (
            <ul className="plain">
              {proposalRows.map(({ proposal: pr }) => (
                <li key={pr.id}>{pr.number} · <Money minor={pr.amountMinor} currency={pr.currency} /> · {pr.depositPercent}% deposit <Badge value={pr.status} /></li>
              ))}
            </ul>
          )}
          <form action={proposalAction} className="stack" style={{ marginTop: 8 }}>
            <input type="hidden" name="prospectId" value={p.id} />
            <p className="small muted">
              Policy for this prospect: {formatMoney(policy.listPriceMinor, policy.currency)} with {policy.depositPercent}% deposit.
              Leave the amount empty to use it. A lower price or deposit goes to the founder for approval.
            </p>
            <div className="fields">
              <label>Title<input name="title" placeholder="EstateOS Complete Digital Package" /></label>
              <label>Amount ({policy.currency})<input name="amount" inputMode="decimal" placeholder={String(policy.listPriceMinor / 100)} /></label>
              <label>Deposit %<input name="depositPercent" type="number" min={0} max={100} placeholder={String(policy.depositPercent)} /></label>
            </div>
            <label>Scope (leave empty for the standard package)<textarea name="scope" /></label>
            <div><button className="secondary" type="submit">Create proposal</button></div>
          </form>
          <p className="small"><Link href="/app/proposals">Manage proposals</Link></p>
        </section>
      </div>

      <h2>Activity</h2>
      {activity.length === 0 ? <Empty>No activity.</Empty> : (
        <ul className="plain card">{activity.map((a) => <li key={a.id} className="small"><When at={a.createdAt} /> · <code>{a.action}</code></li>)}</ul>
      )}
    </>
  );
}
