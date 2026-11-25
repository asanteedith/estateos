import Link from "next/link";
import { getDb } from "@/db/client";
import { PROSPECT_STAGES } from "@/db/schema";
import { createProspect, listProspects } from "@/modules/crm/prospects";
import { requireHqSession } from "@/lib/session";
import { bool, runAction, str } from "@/lib/actions";
import { Badge, Empty, Flash, type SearchParams } from "../../ui";
import { SignalFields } from "./signals";

export const metadata = { title: "Prospects" };

async function addProspect(fd: FormData) {
  "use server";
  await runAction("/app/prospects", async (db, ctx) => {
    const p = await createProspect(
      db,
      ctx,
      {
        companyName: str(fd, "companyName") ?? "",
        website: str(fd, "website"),
        country: str(fd, "country"),
        city: str(fd, "city"),
        segment: str(fd, "segment"),
        contactName: str(fd, "contactName"),
        contactRole: str(fd, "contactRole"),
        email: str(fd, "email"),
        phone: str(fd, "phone"),
        whatsapp: str(fd, "whatsapp"),
        sourceUrl: str(fd, "sourceUrl"),
        sourceNote: str(fd, "sourceNote"),
        notes: str(fd, "notes"),
      },
      {
        hasActiveListings: bool(fd, "hasActiveListings"),
        noOnlineEnquiryForm: bool(fd, "noOnlineEnquiryForm"),
        outdatedOrNoWebsite: bool(fd, "outdatedOrNoWebsite"),
        decisionMakerIdentified: bool(fd, "decisionMakerIdentified"),
        verifiedBusinessContact: bool(fd, "verifiedBusinessContact"),
        inTargetMarket: bool(fd, "inTargetMarket"),
        activeOnSocial: bool(fd, "activeOnSocial"),
      },
    );
    return `Added ${p.companyName}`;
  });
}

export default async function ProspectsPage({ searchParams }: { searchParams: SearchParams }) {
  const { ctx } = await requireHqSession();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const stage = typeof sp.stage === "string" ? sp.stage : undefined;
  const rows = await listProspects(await getDb(), ctx, { q, stage });
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Prospects</h1>
          <div className="small muted">Agencies we may sell to. Every entry should have a public source link.</div>
        </div>
        <form className="inline" method="get">
          <input name="q" placeholder="Search company, city, contact" defaultValue={q} />
          <select name="stage" defaultValue={stage ?? ""}>
            <option value="">All stages</option>
            {PROSPECT_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="secondary" type="submit">Filter</button>
        </form>
      </div>
      <Flash searchParams={searchParams} />

      <details className="card" style={{ marginBottom: "1rem" }}>
        <summary>Add a prospect</summary>
        <form action={addProspect} className="stack" style={{ marginTop: "0.75rem" }}>
          <div className="fields">
            <label>Company name *<input name="companyName" required /></label>
            <label>Website<input name="website" placeholder="agency.com.gh" /></label>
            <label>Country<input name="country" placeholder="Ghana" /></label>
            <label>City<input name="city" placeholder="Accra" /></label>
            <label>Segment<input name="segment" placeholder="Residential sales, rentals, land…" /></label>
            <label>Decision-maker name<input name="contactName" /></label>
            <label>Their role<input name="contactRole" /></label>
            <label>Business email<input name="email" type="email" /></label>
            <label>Phone<input name="phone" /></label>
            <label>WhatsApp<input name="whatsapp" /></label>
            <label>Source URL (where these details were found)<input name="sourceUrl" type="url" /></label>
            <label>Source note<input name="sourceNote" /></label>
          </div>
          <label>Notes<textarea name="notes" /></label>
          <SignalFields />
          <div><button type="submit">Add prospect</button></div>
        </form>
      </details>

      {rows.length === 0 ? (
        <Empty>No prospects yet{q || stage ? " match this filter" : ""}.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Company</th><th>Location</th><th>Contact</th><th className="num">Fit</th><th>Stage</th><th>Verified</th></tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/app/prospects/${p.id}`}>{p.companyName}</Link>{p.website && <div className="small muted">{p.website}</div>}</td>
                  <td>{[p.city, p.country].filter(Boolean).join(", ") || "—"}</td>
                  <td>{p.contactName ?? "—"}{p.contactRole && <div className="small muted">{p.contactRole}</div>}</td>
                  <td className="num">{p.fitScore ?? "—"}</td>
                  <td><Badge value={p.stage} /></td>
                  <td><Badge value={p.verificationStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
