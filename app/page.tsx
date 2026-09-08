import { redirect } from "next/navigation";
import { getContext } from "@/lib/identity";
import { signInWithMicrosoft } from "@/lib/actions";
import { MATTER_FOLDERS } from "@/lib/graph";

export default async function Home() {
  const ctx = await getContext();
  if (ctx) redirect("/matters");

  return (
    <main className="container">
      <section className="hero">
        <div className="kicker">Working prototype</div>
        <h1>The parts of a Filevine replacement that usually go wrong, built and running.</h1>
        <p className="lead">
          One Microsoft sign-in. Roles that the database enforces, not the UI. An ethical wall that hides a
          matter even from a supervisor. A SharePoint folder tree created the moment a matter is opened.
        </p>
        <div className="row" style={{ marginTop: 26 }}>
          <form action={signInWithMicrosoft}>
            <button className="btn btn-primary" type="submit">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <rect x="0" y="0" width="7.5" height="7.5" fill="#f25022" />
                <rect x="8.5" y="0" width="7.5" height="7.5" fill="#7fba00" />
                <rect x="0" y="8.5" width="7.5" height="7.5" fill="#00a4ef" />
                <rect x="8.5" y="8.5" width="7.5" height="7.5" fill="#ffb900" />
              </svg>
              Sign in with Microsoft
            </button>
          </form>
          <span className="muted small">Uses the tenant&apos;s Entra ID. No separate password.</span>
        </div>
      </section>

      <section className="grid grid-4" style={{ marginTop: 12 }}>
        <div className="card feature">
          <h2>1. Entra ID sign-in</h2>
          <p>Standard OpenID Connect against the firm tenant. Delegated Graph token, refreshed silently. MFA and conditional access stay with IT.</p>
        </div>
        <div className="card feature">
          <h2>2. Roles in the database</h2>
          <p>Attorney, paralegal, supervisor. Every query runs under Postgres row-level security keyed to the signed-in email. The UI cannot over-fetch.</p>
        </div>
        <div className="card feature">
          <h2>3. Ethical walls</h2>
          <p>A walled person cannot see the matter, its documents link, its members, or that a wall exists. Supervisor visibility is overridden too.</p>
        </div>
        <div className="card feature">
          <h2>4. SharePoint provisioning</h2>
          <p>Opening a matter creates <code>Matters/NNNN-NNNN - Client/</code> with {MATTER_FOLDERS.length} standard sub-folders through Microsoft Graph, then stores the link.</p>
        </div>
      </section>

      <section className="grid grid-2" style={{ marginTop: 18 }}>
        <div className="card">
          <div className="card-head"><h2>What to try after signing in</h2></div>
          <div className="card-body stack small">
            <p>1. Open a matter. Watch the SharePoint folder tree appear in the tenant&apos;s document library.</p>
            <p>2. Use the demo control to run as a paralegal. The matters list shrinks to assigned matters only and the open-matter form is refused by the database.</p>
            <p>3. Run as the walled attorney. The Collins matter disappears entirely, including from the audit trail.</p>
            <p>4. Back as supervisor, add or remove a wall and see the audit entry written under your own name.</p>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>Standard matter folder tree</h2></div>
          <div className="card-body">
            <ul className="tree">
              {MATTER_FOLDERS.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
