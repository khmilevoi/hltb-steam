import * as errore from "errore";
import { auth } from "@/auth";
import { json } from "@/lib/http";
import { loadUserLibrary } from "@/lib/library/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.steamId) return json(401, { error: "unauthenticated" });

  const steamId = session.user.steamId;
  const force = new URL(req.url).searchParams.get("force") === "1";

  const result = await loadUserLibrary({ steamId, force });
  if (result instanceof Error) return errore.matchError(result, {
    SteamPrivateProfileError: () => json(403, { error: "private_profile" }),
    SteamUnavailableError: () => json(502, { error: "steam_unavailable" }),
    Error: () => json(500, { error: "internal" }),
  });

  return json(200, { games: result.games, cachedAt: result.cachedAt });
}
