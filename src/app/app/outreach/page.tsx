import Link from "next/link";
import { getDb } from "@/db/client";
import { listOutreach } from "@/modules/outreach/service";
import { requireHqSession } from "@/lib/session";
import { Badge, Empty, When } from "../../ui";

export const metadata = { title: "Outreach log" };

export default async function OutreachPage() {
  const { ctx } = await requireHqSession();
  const rows = await listOutreach(await getDb(), ctx);
  const email = rows.filter((r) => r.message.channel === "email");
  const whatsapp = rows.filter((r) => r.message.channel === "whatsapp");
  return (
    <>
      <h1>Outreach log</h1>
      <p className="small muted">
        Every email and WhatsApp message recorded against a prospect. {email.length} email, {whatsapp.length} WhatsApp, {rows.length} total.
        Record new messages from a prospect&apos;s page.
      </p>
      {rows.length === 0 ? <Empty>No outreach recorded yet.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Prospect</th><th>Channel</th><th>Direction</th><th>Status</th><th>Campaign</th><th>Subject</th></tr></thead>
            <tbody>
              {rows.map(({ message: m, companyName }) => (
                <tr key={m.id}>
                  <td><When at={m.occurredAt ?? m.createdAt} /></td>
                  <td><Link href={`/app/prospects/${m.prospectId}`}>{companyName}</Link></td>
                  <td>{m.channel}</td>
                  <td>{m.direction}</td>
                  <td><Badge value={m.status} /></td>
                  <td>{m.campaign ?? "—"}</td>
                  <td>{m.subject ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
