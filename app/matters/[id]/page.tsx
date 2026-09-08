import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getContext } from "@/lib/identity";
import { supabaseFor } from "@/lib/supabase";
import { listMatterFolder } from "@/lib/graph";
import { addMember, addWall, advanceStage, removeWall } from "@/lib/actions";

const STAGES = ["Intake", "Claims Verification", "Medical Management", "Records", "Demand", "Negotiation", "Litigation", "Settlement", "Closing", "Archived"];

export default async function MatterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sp_error?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx) redirect("/");
  const { id } = await params;
  const { sp_error } = await searchParams;

  const db = await supabaseFor(ctx.effective);
  const { data: matter } = await db.from("matters").select("*").eq("id", id).maybeSingle();
  // RLS returns no row for walled or unassigned identities. Treat exactly like a missing id.
  if (!matter) notFound();

  const [{ data: members }, { data: walls }, { data: audit }, { data: users }] = await Promise.all([
    db.from("matter_members").select("email").eq("matter_id", id),
    db.from("matter_walls").select("email, reason, created_by, created_at").eq("matter_id", id),
    db.from("audit_log").select("at, actor_email, action, details").eq("matter_id", id).order("at", { ascending: false }).limit(25),
    db.from("firm_users").select("email, display_name, role").order("display_name"),
  ]);
  const nameOf = (email: string) => users?.find((u) => u.email === email)?.display_name ?? email;
  const isSupervisor = ctx.effective.role === "supervisor";
  const canEdit = ctx.effective.role !== "paralegal";

  let folders: Array<{ name: string; webUrl: string; folder?: { childCount: number } }> = [];
  let folderError: string | null = null;
  if (matter.sharepoint_drive_id && matter.sharepoint_item_id) {
    try {
      folders = await listMatterFolder(ctx.accessToken, matter.sharepoint_drive_id, matter.sharepoint_item_id);
    } catch (err) {
      folderError = err instanceof Error ? err.message : "Could not list folders";
    }
  }

  const memberEmails = new Set((members ?? []).map((m) => m.email));
  const walledEmails = new Set((walls ?? []).map((w) => w.email));
  const candidates = (users ?? []).filter((u) => u.email !== matter.responsible_attorney && !memberEmails.has(u.email) && !walledEmails.has(u.email));

  return (
    <main className="container">
      <div className="page-head">
        <div>
          <div className="kicker">{matter.matter_type}</div>
          <h1>
            <span className="mono">{matter.matter_no}</span> · {matter.client_name}
          </h1>
          <p>
            Responsible: {nameOf(matter.responsible_attorney)} · Date of loss {matter.date_of_loss ?? "n/a"} · Opened {new Date(matter.created_at).toLocaleDateString("en-US")}
          </p>
        </div>
        <Link href="/matters" className="btn btn-ghost">Back to matters</Link>
      </div>

      {sp_error && (
        <div className="notice notice-warn" style={{ marginBottom: 16 }}>
          The matter record was created but SharePoint provisioning failed. See the audit trail below. Re-opening with the same number will reuse any folders that did get created.
        </div>
      )}

      <div className="grid grid-2">
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h2>Stage</h2>
              <span className="badge badge-navy">{matter.stage}</span>
            </div>
            <div className="card-body">
              {canEdit ? (
                <form action={advanceStage} className="row">
                  <input type="hidden" name="matter_id" value={matter.id} />
                  <select name="stage" defaultValue={matter.stage}>
                    {STAGES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                  <button className="btn btn-ghost btn-sm" type="submit">Update stage</button>
                </form>
              ) : (
                <p className="muted small">Paralegals can view the stage. Changing it is an attorney or supervisor action, enforced by the update policy.</p>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>SharePoint workspace</h2>
              {matter.sharepoint_url ? (
                <a className="btn btn-gold btn-sm" href={matter.sharepoint_url} target="_blank" rel="noreferrer">Open in SharePoint</a>
              ) : (
                <span className="badge badge-amber">not provisioned</span>
              )}
            </div>
            <div className="card-body">
              {folderError && <div className="notice notice-error small">{folderError}</div>}
              {!folderError && folders.length > 0 && (
                <ul className="tree">
                  {folders.map((f) => (
                    <li key={f.name}>
                      <a href={f.webUrl} target="_blank" rel="noreferrer">{f.name}</a>
                      {f.folder ? <span className="muted small"> · {f.folder.childCount} items</span> : null}
                    </li>
                  ))}
                </ul>
              )}
              {!folderError && folders.length === 0 && (
                <p className="muted small">
                  {matter.sharepoint_url
                    ? "Folder listing is empty."
                    : "Seeded demo matters have no SharePoint workspace. Matters opened through the form do."}
                </p>
              )}
              <p className="muted small" style={{ marginTop: 10 }}>
                Listed live from Microsoft Graph using the signed-in user&apos;s own permissions. If SharePoint hides a folder from this user, it is hidden here too.
              </p>
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-head"><h2>Team on this matter</h2></div>
            <div className="card-body stack">
              <table>
                <tbody>
                  <tr><td>{nameOf(matter.responsible_attorney)}</td><td><span className="badge badge-navy">responsible attorney</span></td></tr>
                  {(members ?? []).map((m) => (
                    <tr key={m.email}><td>{nameOf(m.email)}</td><td><span className="badge badge-grey">assigned</span></td></tr>
                  ))}
                </tbody>
              </table>
              {canEdit && candidates.length > 0 && (
                <form action={addMember} className="row">
                  <input type="hidden" name="matter_id" value={matter.id} />
                  <select name="email">
                    {candidates.map((u) => <option key={u.email} value={u.email}>{u.display_name}</option>)}
                  </select>
                  <button className="btn btn-ghost btn-sm" type="submit">Assign</button>
                </form>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Ethical wall</h2>
              {isSupervisor ? <span className="badge badge-gold">supervisor control</span> : <span className="badge badge-grey">supervisor only</span>}
            </div>
            <div className="card-body stack">
              {isSupervisor ? (
                <>
                  {(walls ?? []).length === 0 && <p className="muted small">No wall on this matter.</p>}
                  {(walls ?? []).map((w) => (
                    <div key={w.email} className="row" style={{ justifyContent: "space-between" }}>
                      <div>
                        <strong>{nameOf(w.email)}</strong>
                        <div className="small muted">{w.reason} · by {nameOf(w.created_by)}</div>
                      </div>
                      <form action={removeWall}>
                        <input type="hidden" name="matter_id" value={matter.id} />
                        <input type="hidden" name="email" value={w.email} />
                        <button className="btn btn-danger btn-sm" type="submit">Remove wall</button>
                      </form>
                    </div>
                  ))}
                  {candidates.length > 0 && (
                    <form action={addWall} className="stack" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                      <input type="hidden" name="matter_id" value={matter.id} />
                      <div className="row">
                        <select name="email">
                          {candidates.map((u) => <option key={u.email} value={u.email}>{u.display_name}</option>)}
                        </select>
                        <input name="reason" placeholder="Reason (kept in the audit trail)" style={{ flex: 1, minWidth: 200 }} />
                        <button className="btn btn-primary btn-sm" type="submit">Wall off</button>
                      </div>
                      <p className="muted small">Then switch the demo control to that person: this matter vanishes from every page and query.</p>
                    </form>
                  )}
                </>
              ) : (
                <p className="muted small">Walls are managed by a supervisor. Anyone walled off this matter cannot see it at all, so this panel never reveals who is excluded.</p>
              )}
            </div>
          </section>
        </div>
      </div>

      <section className="card" style={{ marginTop: 18 }}>
        <div className="card-head"><h2>Audit trail</h2><span className="muted small">newest first</span></div>
        <div className="card-body">
          {(audit ?? []).length === 0 ? (
            <p className="muted small">No events yet.</p>
          ) : (
            <ul className="timeline">
              {(audit ?? []).map((a, i) => (
                <li key={i}>
                  <time>{new Date(a.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</time>
                  <span>
                    <span className="badge badge-grey">{a.action}</span>{" "}
                    {nameOf(a.actor_email)}
                    {a.details && Object.keys(a.details).length > 0 && (
                      <span className="muted"> · <code>{JSON.stringify(a.details)}</code></span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
