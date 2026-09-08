import { cookies } from "next/headers";
import { auth } from "@/auth";
import { lookupFirmUser, type Identity } from "@/lib/supabase";

export const VIEW_AS_COOKIE = "mw_view_as";

export interface Context {
  /** The Microsoft account that actually signed in. */
  actual: Identity & { isDemoAdmin: boolean };
  /** The identity every query runs as (same as actual unless viewing as someone). */
  effective: Identity;
  /** Graph access token for the signed-in Microsoft user. */
  accessToken: string;
  viewingAs: boolean;
}

/**
 * Resolve who is signed in and who they are currently acting as.
 * "View as" is a demo-only feature: it is honoured solely for accounts flagged
 * is_demo_admin in firm_users, and it only changes the JWT the database sees.
 * That is what makes the row-level security demonstrable from one login.
 */
export async function getContext(): Promise<Context | null> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!session || !email || !session.accessToken || session.error) return null;

  const record = await lookupFirmUser(email);
  const actual = {
    email,
    displayName: record?.display_name ?? session.user?.name ?? email,
    role: record?.role ?? ("paralegal" as const),
    isDemoAdmin: record?.is_demo_admin ?? false,
  };

  let effective: Identity = actual;
  let viewingAs = false;
  if (actual.isDemoAdmin) {
    const viewAs = (await cookies()).get(VIEW_AS_COOKIE)?.value?.toLowerCase();
    if (viewAs && viewAs !== email) {
      const target = await lookupFirmUser(viewAs);
      if (target) {
        effective = { email: target.email, role: target.role, displayName: target.display_name };
        viewingAs = true;
      }
    }
  }

  return { actual, effective, accessToken: session.accessToken, viewingAs };
}
