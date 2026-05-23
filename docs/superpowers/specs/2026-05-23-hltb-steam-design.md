# HLTB × Steam — Design Spec

**Date:** 2026-05-23
**Status:** Approved (brainstorm)
**Author:** brainstorming session

## 1. Summary

Веб-приложение, которое логинит пользователя через Steam OpenID, выгружает его библиотеку игр из Steam Web API, обогащает её часами прохождения с HowLongToBeat (HLTB) и показывает в виде интерактивной таблицы с поиском, сортировкой и фильтром по диапазону HLTB-часов. И Steam-ответы, и HLTB-ответы кешируются на сервере с ручным сбросом из UI.

## 2. Goals / Non-Goals

**Goals (MVP):**

- Sign in through Steam (OpenID).
- Подтянуть библиотеку текущего пользователя (приватные библиотеки требуют публичного game-details в настройках Steam).
- Подтянуть HLTB-часы (main / main+extra / completionist) для каждой игры.
- Показать таблицу с колонками: cover, name, Steam playtime, HLTB main, HLTB main+extra, HLTB completionist.
- Поиск по названию.
- Сортировка по пяти полям: `name`, `steamHours`, `hltbMain`, `hltbMainExtra`, `hltbCompletionist` — выбор поля + направление (asc/desc).
- Фильтр по диапазону HLTB-Main часов (например, "5–20 часов").
- Кеш Steam-ответов (TTL 1 час) и HLTB-ответов (TTL 7 дней) с кнопками ручного сброса.

**Non-Goals (MVP):**

- Фильтр по статусу прохождения (никогда не запускал / в процессе / пройден).
- Достижения, обзоры, цены.
- Просмотр чужих библиотек по vanity URL.
- E2E-тесты.
- Деплой на Vercel (только локальный dev).
- Пользовательские отметки (избранное, completed-overrides).

## 3. Tech Stack

| Слой | Выбор | Обоснование |
|---|---|---|
| Framework | Next.js 16 (App Router) | Frontend + API routes в одном проекте, Fluid Compute на Vercel из коробки |
| Auth | Auth.js v5 + `next-auth-steam` (Steam OpenID provider) | Стандартный готовый поток, никаких велосипедов |
| Server cache | Upstash Redis (через Vercel Marketplace) | KV-доступ из Functions, не нужна полноценная БД |
| Client data | TanStack Query + `@tanstack/query-sync-storage-persister` (localStorage) | Стандарт для серверного состояния, переживает reload |
| UI | shadcn/ui + Tailwind CSS | Копируемые компоненты на Radix, полный контроль стилей |
| Table | TanStack Table | Сортировка/фильтрация из коробки, headless |
| Toasts | sonner (из shadcn/ui) | Стандарт экосистемы |
| HLTB | `howlongtobeat` (npm) | Самый поддерживаемый пакет; обёрнут собственным клиентом |
| Steam | прямой `fetch` к `api.steampowered.com` | Один endpoint (`IPlayerService/GetOwnedGames`) — обёртка не нужна |
| Date formatting | `date-fns` (`formatDistanceToNow`) | Для отображения "updated 12 min ago" |
| Concurrency | `p-limit` | Лимит параллельных HLTB-запросов |
| Error handling | `errore` (errors-as-values) | По правилу проекта |
| Testing | Vitest | Только unit-тесты на ключевую логику |

## 4. Architecture

```
┌─ Browser ────────────────────────────────────┐
│  Next.js Client Component (page.tsx)         │
│  ├─ TanStack Query → /api/library            │
│  └─ TanStack Query → /api/hltb (батчем)      │
└──────────────┬───────────────────────────────┘
               │
┌──────────────▼───────────────────────────────┐
│  Next.js Route Handlers (на Vercel Fluid)    │
│  ├─ /api/auth/[...nextauth]  (Steam OpenID)  │
│  ├─ /api/library             (Steam API)     │
│  └─ /api/hltb                (HLTB scrape)   │
│                  │                            │
│                  ▼                            │
│           Upstash Redis (KV)                  │
│    ── library:{steamId}    TTL 1 час          │
│    ── hltb:{normalizedName} TTL 7 дней        │
└──────────────────────────────────────────────┘
                  │
          ┌───────┴────────┐
          ▼                ▼
   Steam Web API       HLTB (поиск)
```

**Поток:**

1. Пользователь жмёт "Sign in through Steam" → NextAuth OpenID flow → возвращается SteamID64, кладётся в JWT-сессию (`session.user.steamId`).
2. `/library` (Client Component) делает `useQuery(['library'])` → `GET /api/library` → Steam `GetOwnedGames` с server-side ключом → массив `{appid, name, playtimeMinutes, headerImageUrl}`. Ответ кладётся в Upstash KV под ключом `library:{steamId}` с TTL 1 час.
3. После получения библиотеки клиент делает `useQuery(['hltb', appids])` → `POST /api/hltb` со списком `{appid, name}`. Сервер для каждого имени проверяет `hltb:{normalizedName}` в KV; cache miss → скрейп через `howlongtobeat` (с `p-limit(5)`) → запись в KV (TTL 7 дней). Отрицательный результат (`null`) тоже кешируется.
4. Клиент мёрджит Steam + HLTB по `appid` в `GameRow[]`, складывает в TanStack Query (`staleTime: 5min`, `gcTime: 24h`, `refetchOnWindowFocus: false`) + persistor в `localStorage`.
5. Поиск/сортировка/фильтр — `useMemo` над `GameRow[]`, без сетевых запросов.

**Безопасность:**

- `STEAM_API_KEY`, `NEXTAUTH_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` живут в `.env.local` (и Vercel env vars, если когда-то деплой).
- `/api/library` и `/api/hltb` требуют валидную сессию NextAuth.
- Никаких клиентских вызовов к Steam/HLTB — всё через свой бэкенд.

## 5. Project Structure

```
hltb-steam/
├── app/
│   ├── layout.tsx                 # RSC: providers (QueryClient, Session)
│   ├── page.tsx                   # RSC: shell, проверка auth, кнопка sign-in
│   ├── library/
│   │   └── page.tsx               # Client: основной экран с таблицей
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── library/route.ts       # GET → Steam library
│       └── hltb/route.ts          # POST {games[], force?} → HLTB times
├── components/
│   ├── library-table.tsx          # Client: TanStack Table + columns
│   ├── library-filters.tsx        # Client: search + HLTB range slider
│   ├── refresh-controls.tsx       # Client: timestamps + refresh buttons
│   ├── auth-button.tsx            # Client: sign-in/out
│   └── ui/                        # shadcn/ui generated
├── lib/
│   ├── errors.ts                  # tagged errors (createTaggedError)
│   ├── steam/
│   │   ├── client.ts              # fetch GetOwnedGames
│   │   └── openid.ts              # NextAuth Steam OpenID provider config
│   ├── hltb/
│   │   ├── client.ts              # обёртка над howlongtobeat
│   │   └── matcher.ts             # нормализация имени, выбор лучшего совпадения
│   ├── cache/
│   │   └── kv.ts                  # Upstash клиент + getLibrary/setLibrary/getHltb/setHltb
│   └── library/
│       ├── merge.ts               # Steam game + HLTB → GameRow
│       └── filters.ts             # pure: searchByName, sortBy, filterByHltbRange
├── hooks/
│   ├── use-library.ts             # useQuery wrapper для /api/library
│   └── use-hltb.ts                # useQuery wrapper для /api/hltb
├── types/
│   └── game.ts                    # SteamGame, HltbEntry, GameRow
├── tests/
│   ├── lib/library/filters.test.ts
│   ├── lib/library/merge.test.ts
│   ├── lib/hltb/matcher.test.ts
│   ├── lib/steam/client.test.ts
│   └── lib/hltb/client.test.ts
├── .env.local.example
├── package.json
├── tsconfig.json                  # lib includes "ESNext.Disposable" for errore
└── README.md
```

**Юнит-границы:**

| Юнит | Назначение | Зависимости |
|---|---|---|
| `lib/library/filters.ts` | Pure: `searchByName`, `sortBy`, `filterByHltbRange`. `GameRow[] → GameRow[]` | — |
| `lib/hltb/matcher.ts` | Нормализация (`™`, `®`, римские → арабские, suffix "GOTY/Edition"), выбор лучшего совпадения по string-similarity (npm `string-similarity` или `fast-fuzzy`) с порогом ~0.6 | — |
| `lib/library/merge.ts` | `(SteamGame[], Record<appid, HltbEntry \| null>) → GameRow[]` | — |
| `lib/steam/client.ts` | `getOwnedGames(steamId)`, возвращает tagged errors как значения | `STEAM_API_KEY` |
| `lib/hltb/client.ts` | `searchByName(name)`, возвращает tagged errors как значения | `howlongtobeat` |
| `lib/cache/kv.ts` | `get/setLibrary`, `get/setHltb` поверх Upstash | Upstash creds |

Чистые функции тестируются без моков. Внешние клиенты тестируются с моками fetch / npm-пакета. Route handlers — композиция, отдельных тестов не требует.

## 6. Data Types (`types/game.ts`)

```ts
export type SteamGame = {
  appid: number
  name: string
  playtimeMinutes: number      // playtime_forever
  headerImageUrl: string       // собирается на сервере из appid:
                                // `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`
                                // Steam API не отдаёт его в GetOwnedGames напрямую.
}

export type HltbEntry = {
  mainHours: number | null
  mainExtraHours: number | null
  completionistHours: number | null
  hltbId: number
  matchedName: string          // что реально нашлось на HLTB
}

export type GameRow = SteamGame & { hltb: HltbEntry | null }

export type Cached<T> = { value: T; cachedAt: string }  // ISO timestamp
```

## 7. API Contracts

### `POST /api/auth/[...nextauth]`

Стандартный NextAuth с Steam OpenID provider (`next-auth-steam`). На выходе — JWT-сессия с `session.user.steamId: string`.

### `GET /api/library?force=0|1`

Без body, авторизация через NextAuth cookie.

**200**:
```ts
{ games: SteamGame[]; cachedAt: string | null }  // null = свежие данные из Steam
```

**Ошибки:**

| Код | Body | Причина |
|---|---|---|
| 401 | `{ error: "unauthenticated" }` | Нет сессии |
| 403 | `{ error: "private_profile" }` | Steam вернул пустой response |
| 502 | `{ error: "steam_unavailable" }` | Steam API упал |
| 500 | `{ error: "internal" }` | Прочие |

`?force=1` пропускает чтение KV, делает fetch к Steam и переписывает кеш.

### `POST /api/hltb`

**Request body:**
```ts
{ games: Array<{ appid: number; name: string }>; force?: boolean }
```

**200**:
```ts
{
  entries: Record<number /* appid */, HltbEntry | null>
  cachedAt: Record<number, string | null>  // per-entry: ISO если из кеша, null если свежее
}
```

**Поведение:**

- Для каждого имени: `kv.getHltb(normalizedName)` → cache hit → отдаём; cache miss → скрейп → запись в KV (TTL 7 дней).
- Параллелизм через `p-limit(5)` — HLTB банит за флуд.
- Per-name failure не валит ответ; в `entries[appid]` кладётся `null`.

**Ошибки эндпоинта:**

| Код | Body | Причина |
|---|---|---|
| 401 | `{ error: "unauthenticated" }` | Нет сессии |
| 400 | `{ error: "invalid_body" }` | Невалидное тело |

## 8. Caching Strategy

### Серверный кеш (Upstash Redis)

| Ключ | Значение | TTL | Скоуп |
|---|---|---|---|
| `library:{steamId}` | `Cached<SteamGame[]>` | 1 час | Per-user |
| `hltb:{normalizedName}` | `Cached<HltbEntry \| null>` | 7 дней | Global |

`null` для HLTB тоже кешируется — отрицательный кеш предотвращает повторный скрейпинг ненайденных игр.

### Клиентский кеш (TanStack Query)

```ts
{
  staleTime: 5 * 60 * 1000,        // 5 минут — потом фоновый refetch
  gcTime: 24 * 60 * 60 * 1000,     // 24 часа в памяти
  refetchOnWindowFocus: false,
}
```

Plus `persistQueryClient` через `@tanstack/query-sync-storage-persister` в `localStorage` — данные переживают reload.

### Manual refresh

UI-компонент `<RefreshControls/>` в хедере:

```
┌─────────────────────────────────────────────────────────┐
│ Library updated: 12 min ago     HLTB cache: 2 days ago  │
│           [↻ Refresh library]   [↻ Refresh HLTB]        │
└─────────────────────────────────────────────────────────┘
```

- **Refresh library:** `queryClient.invalidateQueries(['library'])` → следующий `useQuery` идёт с `?force=1` → серверная ручка пропускает KV и пишет свежий ответ.
- **Refresh HLTB:** то же для `['hltb']` через `body.force = true`.
- Кнопки дизейблятся на 10 секунд после клика (`useState` + `setTimeout`) — простая защита от спама.
- Timestamps форматируются через `date-fns/formatDistanceToNow`.

## 9. Error Handling (errore conventions)

### Tagged errors (`lib/errors.ts`)

```ts
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

export class HltbFetchError extends errore.createTaggedError({
  name: 'HltbFetchError',
  message: 'HLTB lookup failed for "$name": $reason',
}) {}

export class KvError extends errore.createTaggedError({
  name: 'KvError',
  message: 'Upstash KV $op failed for key $key',
}) {}

export class UnauthenticatedError extends errore.createTaggedError({
  name: 'UnauthenticatedError',
  message: 'No valid Steam session',
}) {}

// Клиентский класс ошибки для границы с TanStack Query
export class LibraryFetchError extends errore.createTaggedError({
  name: 'LibraryFetchError',
  message: 'Library API call failed: HTTP $status ($code)',
}) {}

export class HltbApiError extends errore.createTaggedError({
  name: 'HltbApiError',
  message: 'HLTB API call failed: HTTP $status ($code)',
}) {}
```

### Unit signatures

```ts
// lib/steam/client.ts
getOwnedGames(steamId: string):
  Promise<SteamPrivateProfileError | SteamUnavailableError | SteamGame[]>

// lib/hltb/client.ts
searchByName(name: string):
  Promise<HltbRateLimitError | HltbFetchError | HltbEntry | null>

// lib/cache/kv.ts
getLibrary(steamId): Promise<KvError | Cached<SteamGame[]> | null>
setLibrary(steamId, games): Promise<KvError | void>
getHltb(name): Promise<KvError | Cached<HltbEntry | null> | null>
setHltb(name, entry): Promise<KvError | void>
```

### Boundary code — `.catch()` only at adapters

**`lib/steam/client.ts`:**

```ts
export async function getOwnedGames(steamId: string) {
  const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${env.STEAM_API_KEY}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1`

  const res = await fetch(url).catch(
    (e) => new SteamUnavailableError({ reason: 'fetch failed', cause: e }),
  )
  if (res instanceof Error) return res
  if (!res.ok) return new SteamUnavailableError({ reason: `HTTP ${res.status}` })

  const body = (await res.json().catch(
    (e) => new SteamUnavailableError({ reason: 'invalid JSON', cause: e }),
  )) as SteamApiResponse | SteamUnavailableError
  if (body instanceof Error) return body

  const games = body.response.games
  if (!games || games.length === 0) return new SteamPrivateProfileError({ steamId })

  return games.map(toSteamGame)
}
```

**`lib/cache/kv.ts`:**

```ts
export async function getLibrary(steamId: string) {
  const key = `library:${steamId}`
  const raw = await redis.get(key).catch(
    (e) => new KvError({ op: 'get', key, cause: e }),
  )
  if (raw instanceof Error) return raw
  return (raw as Cached<SteamGame[]> | null) ?? null
}
```

**`lib/hltb/client.ts`:**

```ts
export async function searchByName(name: string) {
  const results = await hltbClient.search(name).catch((e) => {
    if (/429/.test(String(e?.message))) return new HltbRateLimitError({ retryAfterMs: 10_000, cause: e })
    return new HltbFetchError({ name, reason: 'search threw', cause: e })
  })
  if (results instanceof Error) return results
  if (results.length === 0) return null
  return pickBestMatch(results, name)
}
```

### Route handler — flat happy path + `errore.matchError`

**`app/api/library/route.ts`:**

```ts
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.steamId) return json(401, { error: 'unauthenticated' })

  const force = new URL(req.url).searchParams.get('force') === '1'

  if (!force) {
    const cached = await kv.getLibrary(session.user.steamId)
    if (cached instanceof Error) {
      console.warn('KV read failed:', cached.message)
    } else if (cached !== null) {
      return json(200, { games: cached.value, cachedAt: cached.cachedAt })
    }
  }

  const games = await steam.getOwnedGames(session.user.steamId)
  if (games instanceof Error) {
    return errore.matchError(games, {
      SteamPrivateProfileError: () => json(403, { error: 'private_profile' }),
      SteamUnavailableError:    () => json(502, { error: 'steam_unavailable' }),
      Error:                    () => json(500, { error: 'internal' }),
    })
  }

  const writeResult = await kv.setLibrary(session.user.steamId, games)
  if (writeResult instanceof Error) console.warn('KV write failed:', writeResult.message)

  return json(200, { games, cachedAt: null })
}
```

**`app/api/hltb/route.ts`** — аналогично, плюс батч через `Promise.all` (все ошибки — это уже возвращаемые значения, а не throws), затем `errore.partition` для логирования провалов.

### UI / TanStack Query boundary

TanStack Query API ожидает throws для `isError`/`onError` — это **единственное** место в проекте, где мы кидаем (на границе с library).

```ts
async function fetchLibrary({ force }: { force: boolean }) {
  const url = `/api/library${force ? '?force=1' : ''}`
  const res = await fetch(url).catch((e) => new LibraryFetchError({ status: 0, code: 'network', cause: e }))
  if (res instanceof Error) throw res

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new LibraryFetchError({ status: res.status, code: body?.error ?? 'unknown' })
  }
  return (await res.json()) as { games: SteamGame[]; cachedAt: string | null }
}
```

UI получает `error` от хука и через `errore.matchErrorPartial` показывает нужный banner/toast.

### Error scenarios → UI reaction

| Scenario | Detected at | UI reaction |
|---|---|---|
| Не залогинен | middleware / `app/page.tsx` | Редирект на `/`, кнопка "Sign in through Steam" |
| Приватный профиль | `SteamPrivateProfileError` | Banner: "Make your Steam profile and game details public, then refresh" + ссылка на настройки Steam |
| Steam API недоступен | `SteamUnavailableError` | Toast: "Steam is unavailable, try again later" + кнопка retry |
| Сессия истекла | NextAuth middleware | Авто-редирект на login |
| HLTB упал на одной игре | `entries[appid] = null` | Колонка показывает `—`, на hover tooltip "HLTB data unavailable" |
| HLTB не нашёл игру | matcher вернул `null` (кешировано) | То же `—` |
| HLTB rate limit | `HltbRateLimitError` в одном из батчей | Прерываем батч, отдаём что успели; клиент через 10 сек может ретрайнуть |
| Upstash KV недоступен | `KvError` | Логируем (`console.warn`, rule 21), работаем без кеша. Не падаем. |
| Сеть пропала | TanStack Query `onError` | sonner toast, последние данные остаются на экране |

**Принципы:**

1. **Graceful degradation для HLTB** — `Promise.all` над уже-typed-результатами + `null` в ответе. Одна игра не валит экран.
2. **`errore.matchError`** с обязательным `Error`-fallback мапит tagged errors в HTTP-коды.
3. **KV-ошибки не пропагируются** — логируются и работа продолжается. Падение Upstash не валит запрос.
4. **Никаких `try/catch` в route handlers** — все `.catch()` живут только в `lib/*` на границе с fetch/npm.
5. **`controller.abort()`** (если будет использоваться для таймаутов) — только с tagged errors, extending `errore.AbortError`.
6. **`tsconfig.json` lib** включает `"ESNext.Disposable"` для `await using` (на случай если понадобится).

## 10. Testing Strategy

**Стек:** Vitest. Без E2E. Тесты в `tests/`, зеркально структуре `lib/`.

| Файл | Покрытие | Почему |
|---|---|---|
| `tests/lib/library/filters.test.ts` | `searchByName`, `sortBy` для всех пяти полей (`name`, `steamHours`, `hltbMain`, `hltbMainExtra`, `hltbCompletionist`) × asc/desc, `filterByHltbRange(min, max)`. Edge-кейсы: пустой массив, `hltb === null`, NaN-часы | Основная фича, чистые функции |
| `tests/lib/hltb/matcher.test.ts` | Нормализация (`™`, `®`, римские → арабские, `:` vs `-`, "GOTY/Edition" suffix), `pickBestMatch` | Самая хрупкая часть |
| `tests/lib/library/merge.test.ts` | Merge Steam + HLTB, обработка `hltb === null` | Связующий код |
| `tests/lib/steam/client.test.ts` | `SteamPrivateProfileError` на пустой response, `SteamUnavailableError` на HTTP 5xx и невалидный JSON. Мок `fetch` через `vi.stubGlobal` | Корректность boundary |
| `tests/lib/hltb/client.test.ts` | `HltbRateLimitError` на 429, `HltbFetchError` на прочие throws, `null` на пустые результаты. Мок `howlongtobeat` через `vi.mock` | Корректность boundary |

**Не тестируем в MVP:**

- Route handlers — покрыты тестами `lib/*` + ручная проверка локально.
- React-компоненты — логика вытащена в `lib/library/filters.ts`.
- NextAuth flow, Upstash клиент сам по себе.

**Конвенция:** проверяем `instanceof TaggedError` и типизированные properties, не `_tag`-строкой.

```ts
const result = await getOwnedGames('76561198000000000')
expect(result).toBeInstanceOf(SteamPrivateProfileError)
if (result instanceof SteamPrivateProfileError) {
  expect(result.steamId).toBe('76561198000000000')
}
```

**Scripts:**

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

Запуск через `rtk vitest run` для compact-вывода.

## 11. Environment Variables

`.env.local.example`:

```
# Steam
STEAM_API_KEY=

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=

# Upstash Redis
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Получение:

- `STEAM_API_KEY` — https://steamcommunity.com/dev/apikey
- `NEXTAUTH_SECRET` — `openssl rand -base64 32`
- `UPSTASH_REDIS_REST_*` — Upstash Console (или Vercel Marketplace → Upstash → Connect)

## 12. Open Questions

Нет открытых вопросов — все ключевые решения зафиксированы выше. Любые уточнения уровня имплементации (точный конфиг shadcn, версии пакетов) — на этапе writing-plans.
