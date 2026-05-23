import { getServerSession, type NextAuthOptions } from "next-auth";
import Steam, { PROVIDER_ID } from "next-auth-steam";
import type { NextRequest } from "next/server";

process.env.NEXTAUTH_URL ??= process.env.AUTH_URL ?? "http://localhost:3000";

export function createSteamProvider(req: Request | NextRequest) {
  if (!process.env.STEAM_API_KEY) {
    throw new Error("STEAM_API_KEY is not set");
  }

  return Steam(req, {
    clientSecret: process.env.STEAM_API_KEY,
  });
}

function fallbackRequest() {
  return new Request(`${process.env.NEXTAUTH_URL}/api/auth/callback/steam`);
}

export function getAuthOptions(
  req: Request | NextRequest = fallbackRequest(),
): NextAuthOptions {
  return {
    providers: [createSteamProvider(req)],
    callbacks: {
      async jwt({ token, account, profile }) {
        if (account?.provider === PROVIDER_ID && profile) {
          token.steamId = (profile as { steamid?: string }).steamid;
        }
        return token;
      },
      async session({ session, token }) {
        if (typeof token.steamId === "string" && session.user) {
          session.user.steamId = token.steamId;
        }
        return session;
      },
    },
    pages: {
      signIn: "/",
    },
    secret: process.env.NEXTAUTH_SECRET,
  };
}

export const authOptions = getAuthOptions();

export function auth() {
  return getServerSession(authOptions);
}
