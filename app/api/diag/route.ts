// Temporary configuration check. Reports only lengths and short prefixes,
// never full values. Remove once sign-in is verified.
export async function GET() {
  const show = (v?: string) =>
    v ? `${v.length} chars, starts "${v.slice(0, 4)}", ends "${v.slice(-2)}"` : "MISSING";
  const trimmed = (v?: string) => (v && v !== v.trim() ? "HAS WHITESPACE" : "ok");
  const e = process.env;
  return Response.json({
    AUTH_URL: e.AUTH_URL,
    AUTH_SECRET: show(e.AUTH_SECRET),
    AUTH_MICROSOFT_ENTRA_ID_ID: e.AUTH_MICROSOFT_ENTRA_ID_ID,
    AUTH_MICROSOFT_ENTRA_ID_TENANT_ID: e.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID,
    AUTH_MICROSOFT_ENTRA_ID_SECRET: show(e.AUTH_MICROSOFT_ENTRA_ID_SECRET) + " " + trimmed(e.AUTH_MICROSOFT_ENTRA_ID_SECRET),
    SUPABASE_URL: e.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: show(e.SUPABASE_PUBLISHABLE_KEY),
    SUPABASE_JWT_SECRET: show(e.SUPABASE_JWT_SECRET) + " " + trimmed(e.SUPABASE_JWT_SECRET),
  });
}
