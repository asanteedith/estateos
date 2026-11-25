import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { getDb } from "@/db/client";
import { publicAgency, submitEnquiry } from "@/modules/listings/service";
import { userMessage } from "@/lib/actions";
import { allow } from "@/lib/rate-limit";
import { Flash, Money, type SearchParams } from "../../ui";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

async function enquire(fd: FormData) {
  "use server";
  const slug = String(fd.get("slug") ?? "");
  const back = `/p/${encodeURIComponent(slug)}`;
  // Honeypot: real visitors never fill this hidden field.
  if (fd.get("website")) redirect(`${back}?ok=${encodeURIComponent("Thank you. The agency will be in touch.")}`);
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allow(`enquiry:${ip}`, 10, 60 * 60_000)) redirect(`${back}?error=${encodeURIComponent("Too many messages. Please try later.")}`);
  let target = `${back}?ok=${encodeURIComponent("Thank you. The agency will be in touch.")}`;
  try {
    await submitEnquiry(await getDb(), slug, {
      listingId: String(fd.get("listingId") ?? "") || undefined,
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      message: String(fd.get("message") ?? ""),
    });
  } catch (e) {
    target = `${back}?error=${encodeURIComponent(userMessage(e))}`;
  }
  redirect(target);
}

export async function generateMetadata({ params }: { params: Params }) {
  const { slug } = await params;
  const agency = await publicAgency(await getDb(), slug);
  return { title: agency ? `${agency.tenant.name} listings` : "Not found" };
}

export default async function AgencyPublicPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { slug } = await params;
  const agency = await publicAgency(await getDb(), slug);
  if (!agency) notFound();
  return (
    <>
      <header className="public-header">
        <div className="wrap"><strong style={{ fontSize: "1.2rem" }}>{agency.tenant.name}</strong></div>
      </header>
      <main className="wrap" style={{ paddingTop: "1.5rem", paddingBottom: "3rem" }}>
        <Flash searchParams={searchParams} />
        <h1>Properties</h1>
        {agency.listings.length === 0 ? (
          <p className="muted">No properties are listed right now. Send us a message below and we will help you find one.</p>
        ) : (
          <div className="grid two">
            {agency.listings.map((l) => (
              <article className="card" key={l.id}>
                <h3 style={{ marginTop: 0 }}>{l.title}</h3>
                <div className="small muted">{l.location} · {l.propertyType} for {l.offerType}{l.bedrooms != null ? ` · ${l.bedrooms} bed` : ""}{l.bathrooms != null ? ` · ${l.bathrooms} bath` : ""}</div>
                <p style={{ fontWeight: 650, fontSize: "1.1rem" }}><Money minor={l.priceMinor} currency={l.currency} />{l.offerType === "rent" ? " / month" : ""}</p>
                {l.description && <p style={{ whiteSpace: "pre-wrap" }}>{l.description}</p>}
              </article>
            ))}
          </div>
        )}
        <h2>Send an enquiry</h2>
        <form action={enquire} className="stack card" style={{ maxWidth: 560 }}>
          <input type="hidden" name="slug" value={agency.tenant.slug} />
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px" }} />
          {agency.listings.length > 0 && (
            <label>Property
              <select name="listingId"><option value="">General enquiry</option>{agency.listings.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}</select>
            </label>
          )}
          <label>Your name<input name="name" required maxLength={200} /></label>
          <div className="fields">
            <label>Email<input name="email" type="email" /></label>
            <label>Phone / WhatsApp<input name="phone" /></label>
          </div>
          <label>Message<textarea name="message" required minLength={2} maxLength={4000} /></label>
          <p className="small muted">Give an email or a phone number so the agency can reply.</p>
          <div><button type="submit">Send</button></div>
        </form>
      </main>
    </>
  );
}
