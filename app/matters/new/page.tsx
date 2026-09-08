import { redirect } from "next/navigation";
import { getContext } from "@/lib/identity";
import { supabaseFor } from "@/lib/supabase";
import { MATTER_FOLDERS } from "@/lib/graph";
import { NewMatterForm } from "./form";

export default async function NewMatterPage() {
  const ctx = await getContext();
  if (!ctx) redirect("/");

  const db = await supabaseFor(ctx.effective);
  const { data: attorneys } = await db
    .from("firm_users")
    .select("email, display_name, role")
    .in("role", ["attorney", "supervisor"])
    .order("display_name");

  const nextNo = `2026-${String(180 + Math.floor(Math.random() * 800)).padStart(4, "0")}`;

  return (
    <main className="container">
      <div className="page-head">
        <div>
          <h1>Open a matter</h1>
          <p>Creates the record under row-level security, then provisions the SharePoint workspace with your Microsoft token.</p>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-head"><h2>Matter details</h2></div>
          <div className="card-body">
            {ctx.effective.role === "paralegal" && (
              <div className="notice notice-warn" style={{ marginBottom: 14 }}>
                You are running as a paralegal. The form will submit, and the database will refuse the insert. That refusal is the point.
              </div>
            )}
            <NewMatterForm attorneys={attorneys ?? []} defaultMatterNo={nextNo} defaultAttorney={ctx.effective.email} />
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head"><h2>What happens on submit</h2></div>
            <div className="card-body stack small">
              <p>1. Insert into <code>matters</code> as <strong>{ctx.effective.email}</strong>. Policy: role must be attorney or supervisor and <code>created_by</code> must equal the JWT email.</p>
              <p>2. Call Microsoft Graph with your delegated token: find the root site drive, ensure <code>Matters/</code>, create <code>{"<no> - <client>"}</code> and the {MATTER_FOLDERS.length} sub-folders. Idempotent on re-run.</p>
              <p>3. Store the SharePoint link and item id on the matter, write an <code>audit_log</code> row, open the matter page.</p>
              <p className="muted">If Graph fails, the matter still exists and the failure is logged. Provisioning can be retried without duplicating folders.</p>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h2>Folder tree created</h2></div>
            <div className="card-body">
              <ul className="tree">
                {MATTER_FOLDERS.map((f) => <li key={f}>{f}</li>)}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
