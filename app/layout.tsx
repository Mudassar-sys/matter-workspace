import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getContext } from "@/lib/identity";
import { supabaseFor } from "@/lib/supabase";
import { setViewAs, signOutAction } from "@/lib/actions";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Matter Workspace",
  description:
    "Prototype: Microsoft 365 sign-in, role-based access, ethical walls and automatic SharePoint matter folders on Supabase row-level security.",
};

export const dynamic = "force-dynamic";

function roleBadge(role: string) {
  const cls = role === "supervisor" ? "badge-gold" : role === "attorney" ? "badge-navy" : "badge-grey";
  return <span className={`badge ${cls}`}>{role}</span>;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();

  let staff: Array<{ email: string; display_name: string; role: string }> = [];
  if (ctx?.actual.isDemoAdmin) {
    const db = await supabaseFor(ctx.actual);
    const { data } = await db.from("firm_users").select("email, display_name, role").order("display_name");
    staff = data ?? [];
  }

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand">
              <span className="brand-mark">M</span>
              <span>
                Matter Workspace
                <small>Prototype</small>
              </span>
            </Link>
            {ctx && (
              <nav className="nav">
                <Link href="/matters">Matters</Link>
                <Link href="/matters/new">Open matter</Link>
                {ctx.effective.role === "supervisor" && <Link href="/audit">Audit log</Link>}
              </nav>
            )}
            <div className="topbar-right">
              {ctx ? (
                <>
                  <div className="who">
                    <strong>{ctx.effective.displayName}</strong>
                    <span>
                      {ctx.effective.email} · {ctx.effective.role}
                    </span>
                  </div>
                  <form action={signOutAction}>
                    <button className="btn btn-ghost btn-sm" style={{ color: "#fff", borderColor: "rgba(255,255,255,0.25)" }}>
                      Sign out
                    </button>
                  </form>
                </>
              ) : null}
            </div>
          </div>
        </header>

        {ctx?.actual.isDemoAdmin && (
          <div className="viewas">
            <form className="viewas-inner" action={setViewAs}>
              <strong>Demo control</strong>
              <span>Run every query as:</span>
              <select name="email" defaultValue={ctx.viewingAs ? ctx.effective.email : ctx.actual.email}>
                {staff.map((s) => (
                  <option key={s.email} value={s.email}>
                    {s.display_name} ({s.role})
                  </option>
                ))}
              </select>
              <button className="btn btn-gold btn-sm" type="submit">Apply</button>
              <span className="muted">
                {ctx.viewingAs ? (
                  <>Viewing as {roleBadge(ctx.effective.role)} while signed in as {ctx.actual.email}. The database only sees the selected identity.</>
                ) : (
                  <>Switch identity to see how row-level security changes what each role can see. Disabled outside the demo.</>
                )}
              </span>
            </form>
          </div>
        )}

        {children}

        <footer className="foot">
          <span>Matter Workspace prototype. Microsoft Entra ID sign-in, Microsoft Graph, SharePoint, Supabase Postgres with row-level security.</span>
          <span>Demo data only. No client information.</span>
        </footer>
      </body>
    </html>
  );
}
