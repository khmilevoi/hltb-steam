import * as errore from 'errore'

export class SteamPrivateProfileError extends errore.createTaggedError({
  name: 'SteamPrivateProfileError',
  message: 'Steam profile $steamId is private or has hidden game details',
}) {}

export class SteamUnavailableError extends errore.createTaggedError({
  name: 'SteamUnavailableError',
  message: 'Steam Web API request failed: $reason',
}) {}

export class HltbRateLimitError extends errore.createTaggedError({
  name: 'HltbRateLimitError',
  message: 'HLTB rate limited; retry after $retryAfterMs ms',
}) {}

const HltbFetchErrorBase = errore.createTaggedError({
  name: 'HltbFetchError',
  message: 'HLTB lookup failed for "$gameName": $reason',
})

export class HltbFetchError extends HltbFetchErrorBase {
  constructor(args: { name: string | number; reason: string | number; cause?: unknown }) {
    super({ gameName: args.name, reason: args.reason, cause: args.cause })
  }
}

export class KvError extends errore.createTaggedError({
  name: 'KvError',
  message: 'Cache $op failed for key $key',
}) {}

export class UnauthenticatedError extends errore.createTaggedError({
  name: 'UnauthenticatedError',
  message: 'No valid Steam session',
}) {}

export class LibraryFetchError extends errore.createTaggedError({
  name: 'LibraryFetchError',
  message: 'Library API call failed: HTTP $status ($code)',
}) {}

export class HltbApiError extends errore.createTaggedError({
  name: 'HltbApiError',
  message: 'HLTB API call failed: HTTP $status ($code)',
}) {}
