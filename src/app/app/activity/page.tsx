import { getDb } from "@/db/client";
import { listActivity } from "@/modules/ops/activity";
import { requireHqSession } from "@/lib/session";
import { Empty, When } from "../../ui";

export const metadata = { title: "Activity log" };

export default async function ActivityPage() {
  const { ctx } = await requireHqSession();
  const rows = await listActivity(await getDb(), ctx, 200);
  return (
    <>
      <h1>Activity log</h1>
      <p className="small muted">The last 200 recorded actions in this workspace.</p>
      {rows.length === 0 ? <Empty>No activity yet.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Detail</th></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td><When at={a.createdAt} /></td>
                  <td className="small">{a.actorType}</td>
                  <td><code>{a.action}</code></td>
                  <td className="small">{a.detail ? Object.entries(a.detail).map(([k, v]) => `${k}: ${String(v)}`).join(" · ") : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
