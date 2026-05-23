# Migration: `@tanstack/react-table` → `react-data-grid` — Design Spec

**Date:** 2026-05-23
**Status:** Approved (brainstorm)
**Author:** brainstorming session
**Related:** [2026-05-23-hltb-steam-design.md](2026-05-23-hltb-steam-design.md)

## 1. Summary

Заменить `@tanstack/react-table@^8.21.3` на `react-data-grid@7.0.0-beta.59` (npm-пакет того же имени, репозиторий поддерживается Comcast) в `components/library-table.tsx`. Цель — виртуализация строк для больших Steam-библиотек. Внешний вид остаётся 1:1 как у текущей shadcn-таблицы. Сортировка и её персистентность инкапсулируются внутри модуля таблицы; `LibraryScreen` теряет всё, что связано с sort-state.

## 2. Goals / Non-Goals

**Goals:**

- Заменить движок таблицы на `react-data-grid` v7.
- Виртуализация: рендерятся только видимые строки.
- Визуально 1:1 с текущим shadcn-видом (рамка, типографика, hover, dark mode).
- Полная инкапсуляция sort-state + persistence в модуле таблицы. Screen передаёт только `rows` и `hltbLoading`.
- Атомарная декомпозиция: отдельные хуки для столбцов, сортировки, persistence; отдельные cell-компоненты.
- Удалить `@tanstack/react-table` из `package.json`.
- Использовать `zod` (уже в зависимостях) для валидации формата localStorage.

**Non-Goals:**

- Resize / reorder / freeze колонок.
- Inline-редактирование ячеек.
- Множественная сортировка (Ctrl+Click) — оставляем дефолтное поведение RDG, но в UI это не продвигаем.
- Row selection / mass actions.
- Адаптивная высота: используем фиксированную viewport-высоту.
- Миграция старого localStorage-формата `{ id, desc }[]` → тихий сброс на дефолт.
- E2E-тесты грида.

## 3. Архитектура

`LibraryTable` становится самодостаточным: владеет `sortColumns`, читает/пишет в localStorage, сортирует строки. `LibraryScreen` теряет `sorting` state, `parseStoredSorting`, `SORTABLE_COLUMN_IDS`, `DEFAULT_LIBRARY_SORTING`, `LIBRARY_SORTING_STORAGE_KEY`, два sort-related `useEffect`'a. Новый внешний контракт:

```tsx
<LibraryTable rows={visibleRows} hltbLoading={hltb.isFetching} />
```

Файловая структура переезжает из плоского файла в директорию-модуль:

```
components/library-table/
  index.ts                              # barrel: export { LibraryTable }
  library-table.tsx                     # оркестратор: <DataGrid> + контейнер
  library-table.css                     # маппинг --rdg-* → shadcn-переменные
  use-library-columns.ts                # хук: memoized Column<GameRow>[]
  use-persisted-sort-columns.ts         # хук: SortColumn[] ↔ localStorage
  use-sorted-rows.ts                    # хук: компаратор + null/undefined в конец
  cells/
    game-cover-cell.tsx                 # <img> с fallback на placeholder
    hltb-cell.tsx                       # value | skeleton | "--" + Tooltip
  sort-icon.tsx                         # ArrowUp / ArrowDown / ArrowUpDown
```

**Атомарные единицы:**

| Unit | Делает | Зависит от |
|---|---|---|
| `library-table.tsx` | Собирает хуки, рендерит `DataGrid` + `TooltipProvider` + пустое состояние | все хуки и cells |
| `use-library-columns` | Возвращает `Column<GameRow>[]`, мемоизирует по `hltbLoading` | cells, sort-icon |
| `use-persisted-sort-columns` | `[sortColumns, setSortColumns]` с lazy-load из `localStorage` + save через effect; валидация zod-схемой | zod |
| `use-sorted-rows` | `useMemo(() => sortRows(rows, sortColumns), …)`; обрабатывает `undefined`/`null` → в конец независимо от направления | — |
| `game-cover-cell` | `<img>` + локальный `useState` `imageSrc` + `onError` → placeholder | — |
| `hltb-cell` | Skeleton / "--" + Tooltip / `${value}h` | shadcn `Skeleton`, `Tooltip` |
| `sort-icon` | Три иконки lucide по `SortDirection \| undefined` | `lucide-react` |

`STORAGE_KEY = 'hltb-steam:library-sorting'` и `DEFAULT_SORT_COLUMNS` — приватные константы модуля.

## 4. Типы и форматы данных

**Карта `columnKey`:**

| columnKey | sortable | accessor | примечание |
|---|---|---|---|
| `cover` | нет | — | `renderCell` → `<GameCoverCell />` |
| `name` | да | `row.name` | locale-aware compare |
| `steamHours` | да | `row.playtimeMinutes` | numeric |
| `hltbMain` | да | `row.hltb?.mainHours` | nullable → в конец |
| `hltbMainExtra` | да | `row.hltb?.mainExtraHours` | nullable → в конец |
| `hltbCompletionist` | да | `row.hltb?.completionistHours` | nullable → в конец |

Ключи совпадают с прежними `SORTABLE_COLUMN_IDS` намеренно — это упрощает чтение логов и облегчает возможную ручную миграцию старых записей в будущем.

**Внутренние типы** (`components/library-table/use-persisted-sort-columns.ts`):

```ts
const SORTABLE_KEYS = [
  'name', 'steamHours', 'hltbMain', 'hltbMainExtra', 'hltbCompletionist',
] as const

type LibrarySortKey = (typeof SORTABLE_KEYS)[number]
type LibrarySortColumn = { columnKey: LibrarySortKey; direction: 'ASC' | 'DESC' }

const DEFAULT_SORT_COLUMNS: LibrarySortColumn[] = [
  { columnKey: 'name', direction: 'ASC' },
]
const STORAGE_KEY = 'hltb-steam:library-sorting'

const sortColumnSchema = z.object({
  columnKey: z.enum(SORTABLE_KEYS),
  direction: z.enum(['ASC', 'DESC']),
})
const sortColumnsSchema = z.array(sortColumnSchema)
```

`react-data-grid` принимает общий `SortColumn[]`; на границе сужаем тип в `onSortColumnsChange`, отбрасывая невалидные columnKey (защита от рассинхрона).

**Формат localStorage (новый, breaking):**

```json
[{ "columnKey": "name", "direction": "ASC" }]
```

Парсер: `JSON.parse` в `try/catch` → `sortColumnsSchema.safeParse`. На любую ошибку (включая старый формат `{ id, desc }`) — `DEFAULT_SORT_COLUMNS`. Тихий сброс, без миграции.

## 5. Поток сортировки и компаратор

`react-data-grid` сам не сортирует строки (по их доке: *"the grid does not reorder rows for you"*). Поэтому:

```
useLibraryColumns()        → Column<GameRow>[]   (memo по hltbLoading)
usePersistedSortColumns()  → [sortColumns, setSortColumns]
useSortedRows(rows, sortColumns) → GameRow[]    (memo)
        ↓
<DataGrid
  columns={columns}
  rows={sortedRows}
  sortColumns={sortColumns}
  onSortColumnsChange={setSortColumns}
  rowKeyGetter={(row) => row.appid}
  defaultColumnOptions={{ sortable: true, resizable: false }}
/>
```

**Single-column sort.** RDG сам обеспечивает поведение "клик → toggle ASC/DESC/убрать"; при клике по другому заголовку без Ctrl грид заменяет колонку. UX идентичен текущему TanStack.

**Компаратор (`use-sorted-rows.ts`):**

```ts
type Accessor = (row: GameRow) => string | number | null | undefined

const accessors: Record<LibrarySortKey, Accessor> = {
  name: (r) => r.name,
  steamHours: (r) => r.playtimeMinutes,
  hltbMain: (r) => r.hltb?.mainHours ?? undefined,
  hltbMainExtra: (r) => r.hltb?.mainExtraHours ?? undefined,
  hltbCompletionist: (r) => r.hltb?.completionistHours ?? undefined,
}
```

Правила в одной чистой функции `compare(a, b, accessor, direction)`:

1. `va = accessor(a)`, `vb = accessor(b)`.
2. `null`/`undefined` всегда в конце независимо от `direction` (семантика прежнего `sortUndefined: 'last'`). Оба пустые → 0; один пустой → непустой раньше.
3. Иначе: строки — `String#localeCompare`; числа — вычитанием.
4. Результат умножается на `direction === 'DESC' ? -1 : 1`.

`sortColumns` пустой → возвращаем `rows` как есть (no-op, без копирования). Непустой → `[...rows].sort(...)` (не мутируем входной массив — он приходит из `useMemo` в screen).

## 6. Стилизация под shadcn (1:1) и layout

**Layout.** Фиксированная viewport-высота:

```tsx
<div className="rounded-md border overflow-hidden">
  <DataGrid
    className="rdg-light h-[calc(100vh-280px)] min-h-[320px]"
    rowHeight={56}
    headerRowHeight={40}
    ...
  />
</div>
```

RDG рендерит свой `<div role="grid">` с собственным скроллом — внешняя `overflow-x-auto` обёртка от shadcn-таблицы убирается, рамку даёт `rounded-md border`. Точное значение `280px` (отступ под header + filters + paddings) подбирается на dev-сервере.

**Тема CSS-переменными.** `components/library-table/library-table.css` импортируется в `app/layout.tsx` после `react-data-grid/lib/styles.css`:

```css
.rdg {
  --rdg-color: hsl(var(--foreground));
  --rdg-background-color: hsl(var(--background));
  --rdg-header-background-color: hsl(var(--muted));
  --rdg-row-hover-background-color: hsl(var(--muted) / 0.5);
  --rdg-border-color: hsl(var(--border));
  --rdg-font-size: 0.875rem;
  --rdg-selection-color: hsl(var(--ring));
}
```

Dark mode у shadcn — через `.dark` на корне (next-themes). `hsl(var(--*))` подхватывает тёмные значения автоматически в `.dark` scope, дополнительных правил не требует.

Стили имени (`font-medium`) и заголовков (cursor + select-none для sortable) — через `cellClass` / `headerCellClass` в `Column`, не глобально.

**Кастомный SortIcon в шапке.** Свой `renderHeaderCell` сохраняет три состояния (`ArrowUp`/`ArrowDown`/`ArrowUpDown opacity-40`):

```tsx
renderHeaderCell: ({ column, sortDirection }) => (
  <span className="flex items-center whitespace-nowrap">
    {column.name}
    {column.sortable && <SortIcon direction={sortDirection} />}
  </span>
)
```

Дефолтная стрелка RDG не появляется, так как кастомный header рендерится целиком.

**Импорт CSS:**

```ts
// app/layout.tsx
import 'react-data-grid/lib/styles.css'
import '@/components/library-table/library-table.css'
```

**TooltipProvider** остаётся обёрткой в `library-table.tsx` (`delayDuration={200}`), потому что `HltbCell` использует Tooltip для "--".

## 7. Тестирование

Атомарная декомпозиция вытаскивает почти всю логику из `DataGrid` — это обходит проблемы виртуализации в jsdom.

| Файл | Цель |
|---|---|
| `tests/components/library-table/game-cover-cell.test.tsx` | `<img>` падает на `/game-placeholder.svg` при `onError` (замена существующего `library-table.test.tsx`) |
| `tests/components/library-table/hltb-cell.test.tsx` | три ветки: skeleton при `isLoading && !rowHasHltb`, "--" + Tooltip при `value === null`, `${value}h` иначе |
| `tests/components/library-table/use-sorted-rows.test.ts` | компаратор: `undefined`/`null` в конце независимо от направления; numeric vs locale-aware string; пустой `sortColumns` → identity |
| `tests/components/library-table/use-persisted-sort-columns.test.ts` | загрузка валидного JSON, отказ от невалидного (включая старый `{ id, desc }`), save при изменении, no-op при недоступности `localStorage` |

**Smoke-тест на `LibraryTable`** (опционально, если шимы дешевле его написания):

1. `tests/setup.ts` шим `ResizeObserver`:
   ```ts
   globalThis.ResizeObserver = class {
     observe() {} unobserve() {} disconnect() {}
   } as any
   ```
2. Стаб `Element.prototype.scrollIntoView` при первом падении теста.
3. Грид рендерится с явной `style={{ blockSize: 400 }}`, чтобы виртуализация дала видимые строки.

Если шимов набирается слишком много — оставляем только атомарные тесты + проверку, что `LibraryTable` рендерит контейнер с `role="grid"`. Атомарка покрывает всю логику; грид-обёртка — тонкий адаптер.

Существующий `tests/components/library-table.test.tsx` удаляется.

## 8. Риски

| Риск | Вероятность | Митигация |
|---|---|---|
| Виртуализация ломается в jsdom (нет layout, `ResizeObserver`, `scrollIntoView`) | Высокая | Атомарные тесты — основа покрытия; smoke-тест с шимами; если шимы не помогают — оставляем только атомарку |
| `react-data-grid` 7.0.0-beta.59 — beta, возможны breaking changes между релизами | Средняя | Пиним точную версию (`"react-data-grid": "7.0.0-beta.59"`, без `^`); миграция изолирована в одном модуле |
| Высота 56px не подходит под обложку 43px + паддинг | Средняя | Подбираем на dev-сервере; визуальная проверка через preview_screenshot |
| CSS-переменные shadcn не подхватываются в `.rdg` scope | Низкая | Проверяем в светлой и тёмной теме на dev-сервере |
| Tooltip RadixUI внутри виртуализованной ячейки — позиционирование при скролле | Низкая | Tooltip использует `position: fixed` через portal — должен работать; визуальная проверка |
| Потеря сортировки у текущих пользователей (старый формат → дефолт) | Известно и принято | По согласованию: тихий сброс |
| Удаление `@tanstack/react-table` сломает что-то ещё | Низкая | Grep подтвердил: используется только в `library-table.tsx`, `library-screen.tsx`, тесте и доках |

## 9. Порядок реализации (high-level)

Детальный план — задача `writing-plans`. Здесь только последовательность:

1. Установить `react-data-grid@7.0.0-beta.59`; импортировать CSS в `app/layout.tsx`.
2. Создать скелет `components/library-table/` (пустые файлы по структуре из §3).
3. Перенести `GameCoverCell`, `HltbCell`, `SortIcon` как самостоятельные компоненты + написать тесты.
4. Реализовать `use-sorted-rows` + тесты компаратора.
5. Реализовать `use-persisted-sort-columns` (с zod-схемой) + тесты.
6. Реализовать `use-library-columns` (`Column<GameRow>[]` с `renderCell` / `renderHeaderCell`).
7. Собрать `library-table.tsx` (оркестратор: `<TooltipProvider>` + `<DataGrid>` + пустое состояние).
8. Создать `library-table.css` с маппингом `--rdg-*` → shadcn-переменные.
9. Упростить `library-screen.tsx`: удалить sort-state / persistence / parser / константы; контракт сужается до `<LibraryTable rows={visibleRows} hltbLoading={...} />`.
10. Удалить `@tanstack/react-table` из `package.json`, перегенерировать lockfile.
11. Удалить старый `tests/components/library-table.test.tsx`.
12. Визуальная верификация на dev-сервере: светлая / тёмная тема, hover, сортировка, пустое состояние, скролл с большим списком.
