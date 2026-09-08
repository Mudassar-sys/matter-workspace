import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

const TENANT_ID = process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID ?? "";
const CLIENT_ID = process.env.AUTH_MICROSOFT_ENTRA_ID_ID ?? "";
const CLIENT_SECRET = process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET ?? "";

// Delegated Graph scopes used by the prototype. Admin consent for these was
// granted on the app registration, so users only see the standard sign-in.
export const GRAPH_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Sites.ReadWrite.All",
  "Files.ReadWrite.All",
].join(" ");

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    error?: "RefreshTokenError";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    error?: "RefreshTokenError";
  }
}

async function refreshAccessToken(token: JWT): Promise<JWT> {
  if (!token.refreshToken) return { ...token, error: "RefreshTokenError" };
  try {
    const res = await fetch(
      `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          grant_type: "refresh_token",
          refresh_token: token.refreshToken,
          scope: GRAPH_SCOPES,
        }),
      },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description ?? "refresh failed");
    return {
      ...token,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? token.refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + Number(data.expires_in ?? 3600),
      error: undefined,
    };
  } catch {
    return { ...token, error: "RefreshTokenError" };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    MicrosoftEntraID({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      issuer: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
      authorization: { params: { scope: GRAPH_SCOPES } },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
        };
      }
      // Refresh two minutes before expiry so Graph calls never hit a stale token.
      if (token.expiresAt && Date.now() / 1000 < token.expiresAt - 120) {
        return token;
      }
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.error = token.error;
      return session;
    },
  },
});
