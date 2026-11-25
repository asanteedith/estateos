import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { listEnquiries, setEnquiryStatus } from "@/modules/listings/service";
import { requireSession } from "@/lib/session";
import { runAction, str } from "@/lib/actions";
import { Badge, Empty, Flash, When, type SearchParams } from "../../ui";

export const metadata = { title: "Enquiries" };

async function enquiryStatus(fd: FormData) {
  "use server";
  await runAction("/app/enquiries", async (db, ctx) => {
    await setEnquiryStatus(db, ctx, str(fd, "id")!, str(fd, "status") as "contacted");
    return "Enquiry updated";
  });
}

export default async function EnquiriesPage({ searchParams }: { searchParams: SearchParams }) {
  const { ctx } = await requireSession();
  if (ctx.tenantKind === "hq") redirect("/app");
  const rows = await listEnquiries(await getDb(), ctx);
  return (
    <>
      <h1>Enquiries</h1>
      <p className="small muted">Messages sent from the enquiry form on your public page.</p>
      <Flash searchParams={searchParams} />
      {rows.length === 0 ? <Empty>No enquiries yet. Share your public page to start receiving them.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Received</th><th>From</th><th>About</th><th>Message</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map(({ enquiry: e, listingTitle }) => (
                <tr key={e.id}>
                  <td><When at={e.createdAt} /></td>
                  <td>{e.name}<div className="small muted">{[e.email, e.phone].filter(Boolean).join(" · ")}</div></td>
                  <td>{listingTitle ?? "General"}</td>
                  <td className="small" style={{ whiteSpace: "pre-wrap" }}>{e.message}</td>
                  <td><Badge value={e.status} /></td>
                  <td>
                    <form action={enquiryStatus} className="inline">
                      <input type="hidden" name="id" value={e.id} />
                      <select name="status" defaultValue={e.status}><option>new</option><option>contacted</option><option>qualified</option><option>closed</option></select>
                      <button className="secondary small" type="submit">Update</button>
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
