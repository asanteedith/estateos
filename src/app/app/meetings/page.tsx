import Link from "next/link";
import { getDb } from "@/db/client";
import { listMeetings, setMeetingStatus } from "@/modules/outreach/service";
import { requireHqSession } from "@/lib/session";
import { runAction, str } from "@/lib/actions";
import { Badge, Empty, Flash, When, type SearchParams } from "../../ui";

export const metadata = { title: "Meetings" };

async function statusAction(fd: FormData) {
  "use server";
  await runAction("/app/meetings", async (db, ctx) => {
    await setMeetingStatus(db, ctx, str(fd, "id")!, str(fd, "status") as "completed");
    return "Meeting updated";
  });
}

export default async function MeetingsPage({ searchParams }: { searchParams: SearchParams }) {
  const { ctx } = await requireHqSession();
  const rows = await listMeetings(await getDb(), ctx);
  return (
    <>
      <h1>Meetings</h1>
      <p className="small muted">Book meetings from a prospect&apos;s page. Times are shown in Accra time (GMT).</p>
      <Flash searchParams={searchParams} />
      {rows.length === 0 ? <Empty>No meetings booked yet.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Prospect</th><th>Type</th><th>Where</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map(({ meeting: m, companyName }) => (
                <tr key={m.id}>
                  <td><When at={m.scheduledAt} /></td>
                  <td><Link href={`/app/prospects/${m.prospectId}`}>{companyName}</Link></td>
                  <td>{m.kind}</td>
                  <td>{m.location ?? "—"}</td>
                  <td><Badge value={m.status} /></td>
                  <td>
                    <form action={statusAction} className="inline">
                      <input type="hidden" name="id" value={m.id} />
                      <select name="status" defaultValue={m.status}>
                        <option>scheduled</option><option>completed</option><option>cancelled</option><option value="no_show">no show</option>
                      </select>
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
