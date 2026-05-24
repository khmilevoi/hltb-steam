import * as errore from "errore";
import { auth } from "@/auth";
import { json } from "@/lib/http";
import * as kv from "@/lib/cache/kv";
import * as steam from "@/lib/steam/client";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.steamId) return json(401, { error: "unauthenticated" });

  const steamId = session.user.steamId;
  const force = new URL(req.url).searchParams.get("force") === "1";

  if (!force) {
    const cached = await kv.getLibrary(steamId);
    if (cached instanceof Error) {
      console.warn("KV read failed:", cached.message);
    } else if (cached !== null) {
      return json(200, { games: cached.value, cachedAt: cached.cachedAt });
    }
  }

  const games = await steam.getOwnedGames(steamId);
  if (games instanceof Error) {
    return errore.matchError(games, {
      SteamPrivateProfileError: () => json(403, { error: "private_profile" }),
      SteamUnavailableError: () => json(502, { error: "steam_unavailable" }),
      Error: () => json(500, { error: "internal" }),
    });
  }

  const writeResult = await kv.setLibrary(steamId, games);
  if (writeResult instanceof Error) {
    console.warn("KV write failed:", writeResult.message);
  }

  return json(200, { games, cachedAt: null });
}
