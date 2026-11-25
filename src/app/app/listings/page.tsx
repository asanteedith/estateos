import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { createListing, listListings, setListingStatus } from "@/modules/listings/service";
import { parseMoneyToMinor } from "@/modules/shared/money";
import { requireSession } from "@/lib/session";
import { runAction, str } from "@/lib/actions";
import { Badge, Empty, Flash, Money, type SearchParams } from "../../ui";

export const metadata = { title: "Listings" };

const optInt = (v?: string) => (v ? Number(v) : undefined);

async function addListing(fd: FormData) {
  "use server";
  await runAction("/app/listings", async (db, ctx) => {
    await createListing(db, ctx, {
      title: str(fd, "title") ?? "",
      offerType: (str(fd, "offerType") ?? "sale") as "sale",
      propertyType: (str(fd, "propertyType") ?? "house") as "house",
      currency: (str(fd, "currency") ?? "GHS") as "GHS",
      priceMinor: parseMoneyToMinor(str(fd, "price") ?? ""),
      location: str(fd, "location") ?? "",
      bedrooms: optInt(str(fd, "bedrooms")),
      bathrooms: optInt(str(fd, "bathrooms")),
      description: str(fd, "description"),
    });
    return "Listing saved as a draft";
  });
}

async function listingStatus(fd: FormData) {
  "use server";
  await runAction("/app/listings", async (db, ctx) => {
    await setListingStatus(db, ctx, str(fd, "id")!, str(fd, "status") as "published");
    return "Listing updated";
  });
}

export default async function ListingsPage({ searchParams }: { searchParams: SearchParams }) {
  const { ctx, tenant } = await requireSession();
  if (ctx.tenantKind === "hq") redirect("/app");
  const rows = await listListings(await getDb(), ctx);
  return (
    <>
      <h1>Listings</h1>
      <p className="small muted">Published listings appear on your public page at /p/{tenant.slug}.</p>
      <Flash searchParams={searchParams} />
      <details className="card" style={{ marginBottom: "1rem" }} open={rows.length === 0}>
        <summary>Add a listing</summary>
        <form action={addListing} className="stack" style={{ marginTop: "0.75rem" }}>
          <div className="fields">
            <label>Title<input name="title" required placeholder="3-bedroom house, East Legon" /></label>
            <label>For<select name="offerType"><option value="sale">sale</option><option value="rent">rent</option></select></label>
            <label>Type<select name="propertyType"><option>house</option><option>apartment</option><option>land</option><option>commercial</option><option>other</option></select></label>
            <label>Location<input name="location" required /></label>
            <label>Currency<select name="currency"><option>GHS</option><option>USD</option></select></label>
            <label>Price<input name="price" inputMode="decimal" required /></label>
            <label>Bedrooms<input name="bedrooms" type="number" min={0} /></label>
            <label>Bathrooms<input name="bathrooms" type="number" min={0} /></label>
          </div>
          <label>Description<textarea name="description" /></label>
          <div><button type="submit">Save draft</button></div>
        </form>
      </details>
      {rows.length === 0 ? <Empty>No listings yet.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Listing</th><th>For</th><th className="num">Price</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td>{l.title}<div className="small muted">{l.location} · {l.propertyType}{l.bedrooms != null ? ` · ${l.bedrooms} bed` : ""}</div></td>
                  <td>{l.offerType}</td>
                  <td className="num"><Money minor={l.priceMinor} currency={l.currency} /></td>
                  <td><Badge value={l.status} /></td>
                  <td>
                    <form action={listingStatus} className="inline">
                      <input type="hidden" name="id" value={l.id} />
                      {l.status !== "published" && <button className="small" name="status" value="published">Publish</button>}
                      {l.status === "published" && <button className="small secondary" name="status" value="draft">Unpublish</button>}
                      {l.status !== "archived" && <button className="small danger" name="status" value="archived">Archive</button>}
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
