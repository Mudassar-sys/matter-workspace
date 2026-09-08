import Link from "next/link";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/identity";
import { supabaseFor } from "@/lib/supabase";

export default async function AuditPage() {
  const ctx = await getContext();
  if (!ctx) redirect("/");

  const db = await supabaseFor(ctx.effective);
  const [{ data: audit }, { data: matters }, { data: users }] = await Promise.all([
    db.from("audit_log").select("id, at, actor_email, action, matter_id, details").order("at", { ascending: false }).limit(200),
    db.from("matters").select("id, matter_no, client_name"),
    db.from("firm_users").select("email, display_name"),
  ]);
  const matterOf = (id: string | null) => matters?.find((m) => m.id === id);
  const nameOf = (email: string) => users?.find((u) => u.email === email)?.display_name ?? email;

  return (
    <main className="container">
      <div className="page-head">
        <div>
          <h1>Audit log</h1>
          <p>
            {ctx.effective.role === "supervisor"
              ? "Firm-wide view. Every write in the prototype leaves a row here under the acting identity."
              : "Limited view. You only see events on matters you can see. Supervisors see everything."}
          </p>
        </div>
      </div>
      <section className="card">
        <table>
          <thead>
            <tr><th>When</th><th>Who</th><th>Action</th><th>Matter</th><th>Details</th></tr>
          </thead>
          <tbody>
            {(audit ?? []).map((a) => {
              const m = matterOf(a.matter_id);
              return (
                <tr key={a.id}>
                  <td className="small muted mono">{new Date(a.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td className="small">{nameOf(a.actor_email)}</td>
                  <td><span className="badge badge-grey">{a.action}</span></td>
                  <td className="small">{m ? <Link href={`/matters/${m.id}`}><span className="mono">{m.matter_no}</span> {m.client_name}</Link> : <span className="muted">hidden or deleted</span>}</td>
                  <td className="small muted"><code>{JSON.stringify(a.details)}</code></td>
                </tr>
              );
            })}
            {(audit ?? []).length === 0 && (
              <tr><td colSpan={5} className="muted small">No events visible to this identity.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
