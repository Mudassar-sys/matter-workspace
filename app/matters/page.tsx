import Link from "next/link";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/identity";
import { supabaseFor } from "@/lib/supabase";

const STAGE_CLASS: Record<string, string> = {
  Intake: "badge-grey",
  "Claims Verification": "badge-grey",
  "Medical Management": "badge-navy",
  Records: "badge-navy",
  Demand: "badge-amber",
  Negotiation: "badge-amber",
  Litigation: "badge-red",
  Settlement: "badge-green",
  Closing: "badge-green",
  Archived: "badge-grey",
};

function daysSince(d: string) {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

export default async function MattersPage() {
  const ctx = await getContext();
  if (!ctx) redirect("/");

  const db = await supabaseFor(ctx.effective);
  const [{ data: matters }, { data: users }] = await Promise.all([
    db
      .from("matters")
      .select("id, matter_no, client_name, matter_type, stage, date_of_loss, responsible_attorney, sharepoint_url, created_at")
      .order("matter_no"),
    db.from("firm_users").select("email, display_name"),
  ]);
  const nameOf = (email: string) => users?.find((u) => u.email === email)?.display_name ?? email;

  const rows = matters ?? [];
  const inLitigation = rows.filter((m) => m.stage === "Litigation").length;
  const demandReady = rows.filter((m) => m.stage === "Demand" || m.stage === "Negotiation").length;
  const provisioned = rows.filter((m) => m.sharepoint_url).length;

  return (
    <main className="container">
      <div className="page-head">
        <div>
          <h1>Matters</h1>
          <p>
            Showing what <strong>{ctx.effective.displayName}</strong> is allowed to see. The list is filtered by the
            database, not by this page.
          </p>
        </div>
        {ctx.effective.role !== "paralegal" && (
          <Link href="/matters/new" className="btn btn-primary">Open a matter</Link>
        )}
      </div>

      <section className="grid grid-4">
        <div className="card stat"><div className="label">Visible matters</div><div className="value">{rows.length}</div><div className="sub">for this identity</div></div>
        <div className="card stat"><div className="label">Demand or negotiation</div><div className="value">{demandReady}</div><div className="sub">money stage</div></div>
        <div className="card stat"><div className="label">In litigation</div><div className="value">{inLitigation}</div><div className="sub">deadline sensitive</div></div>
        <div className="card stat"><div className="label">SharePoint workspaces</div><div className="value">{provisioned}</div><div className="sub">of {rows.length} provisioned</div></div>
      </section>

      <section className="card" style={{ marginTop: 18 }}>
        <div className="card-head">
          <h2>Matter list</h2>
          <span className="muted small">
            Role: <strong>{ctx.effective.role}</strong>
            {ctx.effective.role === "supervisor" ? " · sees every matter unless walled" : ctx.effective.role === "attorney" ? " · sees own and assigned matters" : " · sees assigned matters only"}
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="card-body">
            <div className="notice notice-info">
              No matters are visible to this identity. Either nothing is assigned yet, or an ethical wall applies. Nothing about hidden matters leaks to this page.
            </div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Matter</th>
                <th>Client</th>
                <th>Type</th>
                <th>Stage</th>
                <th>Age</th>
                <th>Responsible</th>
                <th>Documents</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td><Link href={`/matters/${m.id}`} className="mono"><strong>{m.matter_no}</strong></Link></td>
                  <td><Link href={`/matters/${m.id}`}>{m.client_name}</Link></td>
                  <td className="small">{m.matter_type}</td>
                  <td><span className={`badge ${STAGE_CLASS[m.stage] ?? "badge-grey"}`}>{m.stage}</span></td>
                  <td className="small muted">{daysSince(m.created_at)} d</td>
                  <td className="small">{nameOf(m.responsible_attorney)}</td>
                  <td className="small">
                    {m.sharepoint_url ? (
                      <a href={m.sharepoint_url} target="_blank" rel="noreferrer">SharePoint folder</a>
                    ) : (
                      <span className="muted">not provisioned</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
