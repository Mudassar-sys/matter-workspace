import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? "";

export type FirmRole = "attorney" | "paralegal" | "supervisor";

export interface Identity {
  email: string;
  role: FirmRole;
  displayName: string;
}

/**
 * Sign a short-lived Supabase JWT for the given identity. Every query then runs
 * under Postgres row-level security using the `email` and `app_role` claims.
 * The service key is never used from the app, so a bug in the UI cannot leak a
 * row that the policies would hide.
 */
export async function signSupabaseJwt(identity: Identity): Promise<string> {
  const secret = new TextEncoder().encode(SUPABASE_JWT_SECRET);
  return new SignJWT({
    role: "authenticated",
    email: identity.email.toLowerCase(),
    app_role: identity.role,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(identity.email.toLowerCase())
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);
}

export async function supabaseFor(identity: Identity): Promise<SupabaseClient> {
  const jwt = await signSupabaseJwt(identity);
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Directory lookup runs as a minimal identity so it works before roles resolve. */
export async function lookupFirmUser(email: string) {
  const client = await supabaseFor({ email, role: "paralegal", displayName: "" });
  const { data } = await client
    .from("firm_users")
    .select("email, display_name, role, is_demo_admin")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return data as
    | { email: string; display_name: string; role: FirmRole; is_demo_admin: boolean }
    | null;
}
