import Link from "next/link";
import { getDb } from "@/db/client";
import { pipelineBoard } from "@/modules/crm/prospects";
import { requireHqSession } from "@/lib/session";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage() {
  const { ctx } = await requireHqSession();
  const board = await pipelineBoard(await getDb(), ctx);
  const total = board.reduce((n, c) => n + c.items.length, 0);
  return (
    <>
      <h1>Sales pipeline</h1>
      <p className="small muted">{total} prospects. Stages move forward automatically when messages, meetings, proposals and verified payments are recorded.</p>
      <div className="board">
        {board.map((col) => (
          <div className="col" key={col.stage}>
            <h3>{col.stage} ({col.items.length})</h3>
            {col.items.map((p) => (
              <div className="item" key={p.id}>
                <Link href={`/app/prospects/${p.id}`}>{p.companyName}</Link>
                <div className="small muted">{[p.city, p.country].filter(Boolean).join(", ")}{p.fitScore != null ? ` · fit ${p.fitScore}` : ""}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
