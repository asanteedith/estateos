import { getDb } from "@/db/client";
import { createTask, listAgents, listTasks, updateTaskStatus, type TaskStatus } from "@/modules/ops/agents";
import { requireHqSession } from "@/lib/session";
import { runAction, str } from "@/lib/actions";
import { Badge, Empty, Flash, When, type SearchParams } from "../../ui";

export const metadata = { title: "Agents and tasks" };

async function addTask(fd: FormData) {
  "use server";
  await runAction("/app/agents", async (db, ctx) => {
    const due = str(fd, "dueAt");
    await createTask(db, ctx, {
      agentKey: str(fd, "agentKey") ?? "",
      title: str(fd, "title") ?? "",
      detail: str(fd, "detail"),
      priority: Number(str(fd, "priority") ?? 3),
      dueAt: due ? new Date(due) : undefined,
    });
    return "Task queued";
  });
}

async function taskStatus(fd: FormData) {
  "use server";
  await runAction("/app/agents", async (db, ctx) => {
    await updateTaskStatus(db, ctx, str(fd, "id")!, str(fd, "status") as TaskStatus);
    return "Task updated";
  });
}

export default async function AgentsPage({ searchParams }: { searchParams: SearchParams }) {
  const { ctx } = await requireHqSession();
  const db = await getDb();
  const [agents, tasks] = await Promise.all([listAgents(db, ctx), listTasks(db, ctx)]);
  return (
    <>
      <h1>Agents and task queue</h1>
      <p className="small muted">
        The nine operating roles and the work assigned to each. Mode “manual” means a person or a Claude session picks up the
        task; nothing here runs on its own.
      </p>
      <Flash searchParams={searchParams} />

      <div className="grid two">
        {agents.map((a) => (
          <div className="card" key={a.id}>
            <strong>{a.name}</strong> <Badge value={a.automation} /> <span className="badge">{a.openTasks} open</span>
            <ul className="small">{a.responsibilities.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
        ))}
      </div>

      <h2>Queue a task</h2>
      <form action={addTask} className="stack card">
        <div className="fields">
          <label>Agent<select name="agentKey">{agents.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}</select></label>
          <label>Title<input name="title" required minLength={3} /></label>
          <label>Priority (1 highest)<select name="priority" defaultValue="3">{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label>
          <label>Due<input name="dueAt" type="datetime-local" /></label>
        </div>
        <label>Detail<textarea name="detail" /></label>
        <div><button type="submit">Queue task</button></div>
      </form>

      <h2>All tasks</h2>
      {tasks.length === 0 ? <Empty>No tasks yet.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>P</th><th>Task</th><th>Agent</th><th>Status</th><th>Due</th><th></th></tr></thead>
            <tbody>
              {tasks.map(({ task: t, agentName }) => (
                <tr key={t.id}>
                  <td>{t.priority}</td>
                  <td>{t.title}{t.detail && <div className="small muted" style={{ whiteSpace: "pre-wrap" }}>{t.detail}</div>}</td>
                  <td>{agentName}</td>
                  <td><Badge value={t.status} /></td>
                  <td><When at={t.dueAt} /></td>
                  <td>
                    <form action={taskStatus} className="inline">
                      <input type="hidden" name="id" value={t.id} />
                      <select name="status" defaultValue={t.status}>
                        <option value="queued">queued</option><option value="in_progress">in progress</option><option value="blocked">blocked</option><option value="done">done</option><option value="cancelled">cancelled</option>
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
