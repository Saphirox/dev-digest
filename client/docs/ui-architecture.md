# client — архітектура UI

Практичний огляд `@devdigest/web`. Карта маршрутів → ендпоінтів у
[../README.md](../README.md#ui-route-map); правила — у [../CLAUDE.md](../CLAUDE.md).

## Розкладка

```
src/app/**/page.tsx          маршрути — тонкі
  └── _components/<Name>/    уся логіка фічі, поруч із маршрутом
src/components/<kebab>/      те, що ділять кілька маршрутів
src/vendor/ui                дизайн-система (@devdigest/ui) — лише через barrel
src/lib/hooks/*              кожен фетч живе тут
src/vendor/shared            контракти (ручна копія серверних)
```

**Сторінки тонкі.** `page.tsx` резолвить параметри, смикає хуки й роздає пропи.
Усе інше — у колокованій теці компонента з власним `*.test.tsx`.

**Тека компонента** — `<Name>.tsx` плюс, за потреби, `constants.ts`,
`helpers.ts`, `styles.ts`, `index.ts`, `<Name>.test.tsx`. Стилі — об'єкт `s` у
`styles.ts`, а не інлайн у JSX.

**Імпорт UI лише з barrel**: `import { Button } from "@devdigest/ui"`. Не можна
тягнути з `src/vendor/ui/<layer>/*` напряму.

## Дані

Кожен фетч — через хук у `src/lib/hooks/*` поверх `lib/api.ts`
(`NEXT_PUBLIC_API_BASE`, типово `http://localhost:3001`). Компоненти не
викликають `fetch` самі.

TanStack Query дає кеш за ключем — цим користується колонка FINDINGS у списку
PR: знахідки довантажуються при першому наведенні (`usePrReviews`), а далі
беруться з кешу.

**Перш ніж додавати хук «щоб показати більше деталей про X», перевір, чи ці
дані вже є на сторінці й чи не можна прокинути їх пропом.** Чіпи в таймлайні
саме так і зроблено — нуль нових запитів.

## Пастка: колонка в списку PR

Додати колонку — це **три** непов'язані місця, інакше заголовки поїдуть
відносно комірок:

1. `GRID` — `gridTemplateColumns` (`pulls/constants.ts`)
2. `COLUMN_KEYS` — лише рядок заголовків (там само)
3. комірка в `PRRow.tsx`

Пов'язані вони лише спільним шаблоном — нічого в коді не змусить їх збігатися.

## i18n

`next-intl`, один файл простору імен на фічу
(`messages/<locale>/<namespace>.json`), ключі — крапкою: `t("list.columns.cost")`.
Новий текст — у JSON, не в JSX.

## Тести

`vitest` + jsdom, `fetch` замокано — API й браузер не потрібні:

```sh
pnpm test        # або ./node_modules/.bin/vitest run
pnpm typecheck
```

Компонент із перекладами загортається в `NextIntlClientProvider` із сирим JSON.
`@testing-library/user-event` у проєкті **немає** — використовуй `fireEvent`.

Наскрізні сценарії (клієнт + API + БД) живуть у [`../e2e`](../../e2e/README.md),
не тут.
