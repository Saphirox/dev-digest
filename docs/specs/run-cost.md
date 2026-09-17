# Run Cost — специфікація та план

**Статус:** реалізовано (2026-09-16) · **Модулі:** `server`, `client`
(`reviewer-core` — без змін) · міграція `0010_clumsy_aqueduct.sql`

Показати вартість LLM-запусків у трьох місцях студії. Нуль додаткових викликів
моделі: цифра вже приходить у відповіді провайдера, її лише треба зберегти й
довести до UI.

---

## 1. Що вже є (і чому фіча зводиться до «полагодити обрив»)

Ланцюжок вартості реалізований на 80% — і обривається рівно в одному місці.

| Крок | Стан | Де |
|---|---|---|
| Просимо OpenRouter повернути реальну вартість (`usage: { include: true }`) | ✅ є | `reviewer-core/src/llm/openrouter.ts:82` |
| Читаємо `usage.cost` (USD) з відповіді | ✅ є | `reviewer-core/src/llm/openrouter.ts:99` |
| Фолбек на прайс-бук, коли `usage.cost` відсутній | ✅ є | `reviewer-core/src/llm/openrouter.ts:110` |
| Живі ціни OpenRouter (TTL 6 год) інжектяться в провайдер | ✅ є | `server/src/platform/price-book.ts` · `container.ts:186` |
| Статична таблиця цін як останній фолбек | ✅ є | `server/src/adapters/llm/pricing.ts` |
| Сума вартості по всіх чанках map-reduce | ✅ є | `reviewer-core/src/review/run.ts:184` |
| `ReviewOutcome.costUsd` віддається назад у сервер | ✅ є | `reviewer-core/src/review/run.ts:216` |
| **Сервер читає `outcome.costUsd`** | ❌ **обрив** | `server/src/modules/reviews/run-executor.ts:213` — деструктуризує `{ tokensIn, tokensOut, grounding }`, `costUsd` мовчки відкидається |
| **Колонка `agent_runs.cost_usd`** | ❌ **видалена** | `server/src/db/migrations/0009_complex_runaways.sql` — `ALTER TABLE "agent_runs" DROP COLUMN "cost_usd"` |
| Поле в контрактах API (`RunSummary`, `RunStats`, `PrMeta`) | ❌ немає | `server/src/vendor/shared/contracts/{trace,platform}.ts` |
| UI на трьох екранах | ❌ немає | див. §4 |

**Висновок:** реалізація — це відновити колонку, протягнути одне число через
три контракти й додати один спільний компонент форматування. Жодної нової
логіки ціноутворення писати не треба.

> Побічно: `eval_runs.cost_usd` і `ci_runs.cost_usd` у схемі лишилися —
> видалили саме й тільки `agent_runs`. Контракти `AgentColumn.cost_usd` та
> `AgentStats.total_cost_usd` в `observability.ts` уже описують вартість, але
> це заготовки під майбутні уроки (реалізації немає) — не чіпаємо.

---

## 2. Ухвалені рішення

| # | Питання | Рішення | Чому |
|---|---|---|---|
| D1 | Що показує COST у списку PR | **Останній завершений запуск** (`status='done'`, найновіший `ran_at`) | Симетрично до вже наявної колонки SCORE, яка теж показує останній рев'ю, а не агрегат. Одна цифра = один запуск, її можна звірити з таймлайном очима |
| D2 | Формат | `formatUsd()` — **≥3 значущі цифри**, адаптивно | Вимога слайда. Один формат на всі три екрани замість трьох правил |
| D3 | Джерело цифри | `usage.cost` → PriceBook (живі ціни) → статична таблиця → `null` | Ланцюжок уже реалізований у `openrouter.ts:110`; нічого не додаємо |
| D4 | Немає даних | Скрізь `—`, **бекфілу немає** | «Прогін без даних → `—`, не `$0.00`». Історичні рядки після 0009 лишаються `NULL`; бекфіл із tokens×price дав би цифри, що не зійдуться з дашбордом OpenRouter, і зламав би критерій «звірка цифр» |
| D5 | Що саме лежить у колонці | **Готове USD, пораховане один раз на момент запуску** | У БД зберігаємо суму, а не токени для множення на прайс при читанні. Ціни моделей змінюються (`PriceBook` оновлюється кожні 6 год) — якби вартість рахувалася на читанні, історичні запуски заднім числом дорожчали б і дешевшали. Токени зберігаються окремо (`tokens_in/out`) і для вартості не використовуються |

### Наслідок D1, який треба знати наперед

Після «Review all» із трьома агентами створюються **три** рядки `agent_runs`.
Колонка COST покаже вартість **одного** (останнього), а не всіх трьох. Це
свідомий вибір: цифра в списку має збігатися з конкретним рядком таймлайну.
Сумарну вартість PR має сенс додати окремою фічею (`Σ`-бейдж або тултип) —
у цю не входить.

### Наслідок all-or-nothing акумуляції

`run.ts:184` рахує так: якщо **хоч один** чанк map-reduce повернув `null`
вартість — увесь запуск дає `null`. Не змінюємо: часткова сума — це брехня
про вартість. На практиці з PriceBook-фолбеком `null` майже недосяжний.

---

## 3. Серверна частина

### 3.1 Схема БД

`server/src/db/schema/runs.ts` — повернути колонку в `agentRuns`:

```ts
/** Вартість запуску в USD. NULL = невідома (провайдер не повернув і ціни
    моделі немає) — UI показує «—», ніколи «$0.00». */
costUsd: doublePrecision('cost_usd'),
```

Міграція: `pnpm db:generate` → нова `0010_*.sql` з `ADD COLUMN`. Старі міграції
не редагуємо (незмінні). Застосування — `pnpm db:migrate`, вручну: на буті
міграції не накочуються.

> `doublePrecision` — саме той тип, що був у `0000_init.sql:12` і яким досі
> оголошені `eval_runs.cost_usd` / `ci_runs.cost_usd`. Тримаємо однаковим.

### 3.2 Запис вартості

`server/src/modules/reviews/run-executor.ts`:

- рядок 213: `const { tokensIn, tokensOut, grounding, costUsd } = outcome;`
- рядок 243 (`completeAgentRun`): додати `costUsd`
- рядок 264 (`trace.stats`): додати `cost_usd: costUsd`
- гілка помилки (рядок 297): **явно** `costUsd: null` — не `0`, згідно з D4

`server/src/modules/reviews/repository.ts:151` — розширити тип `values` у
`completeAgentRun` полем `costUsd: number | null`; `repository/run.repo.ts` —
записати його в `set(...)`.

### 3.3 Контракти

Канонічна копія — `server/src/vendor/shared/`; копію в
`client/src/vendor/shared/` синхронізуємо **вручну**.

`contracts/trace.ts`:

```ts
export const RunStats = z.object({
  duration_ms: z.number().int(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  /** USD за цей запуск; null = невідомо (UI показує «—»). */
  cost_usd: z.number().nullish(),
  findings: z.number().int(),
  grounding: z.string(),
});

export const RunSummary = z.object({
  // …
  cost_usd: z.number().nullable(),
});
```

`RunStats.cost_usd` саме **`nullish`**, а не `nullable`: `run_traces.trace` —
це `jsonb`-документ, уже збережені траси не мають цього ключа, і суворе поле
зламало б їх на читанні. `RunSummary.cost_usd` — `nullable`, бо будується з
рядка БД щоразу заново.

`contracts/platform.ts` — `PrMeta`:

```ts
/** Вартість ОСТАННЬОГО завершеного запуску (тільки list-ендпоїнт; null доки
    не було жодного завершеного запуску). */
cost_usd: z.number().nullish(),
```

`nullish` тут обов'язковий: `PrMeta` — це ще й контракт GitHub-адаптера
(`adapters.ts:144`, `listPullRequests`), який вартості не знає й не має.
Точно та сама причина, з якої `score` оголошений `nullish`.

### 3.4 Ендпоїнти

**`GET /pulls/:id/runs`** (`repository/run.repo.ts:50`, `listRunsForPull`) —
додати `cost_usd: run.costUsd` у мапінг. Більше нічого: рядок уже читається
цілком (`select({ run: t.agentRuns, … })`).

**`GET /repos/:id/pulls`** (`modules/pulls/routes.ts:113-136`) — поруч із
наявною агрегацією `latestReviewByPr` додати `latestCostByPr`:

```ts
// Вартість ОСТАННЬОГО завершеного запуску на PR — колонка COST у списку.
// Той самий прийом, що й для score: один IN-запит, сортування newest-first,
// перший побачений рядок на PR і є останнім (список PR малий).
const costRows = await container.db
  .select({ prId: t.agentRuns.prId, costUsd: t.agentRuns.costUsd })
  .from(t.agentRuns)
  .where(and(inArray(t.agentRuns.prId, prIds), eq(t.agentRuns.status, 'done')))
  .orderBy(desc(t.agentRuns.ranAt));
```

…і `cost_usd: latestCostByPr.get(r.id) ?? null` у відповіді.

Фільтр `status='done'` навмисний: запуск, що триває, ще не має вартості, а
failed за D4 її не має ніколи. Якщо останній done-запуск має `cost_usd = NULL`
(невідома модель) — показуємо `—`, не шукаємо глибше в історії: список має
відповідати останньому запуску, а не «останньому, де щось було».

### 3.5 Чого сервер НЕ робить

- не рахує ціну сам — лише зберігає те, що повернув `reviewer-core`;
- не агрегує суму по PR (див. наслідок D1);
- не бекфілить історичні рядки (D4);
- не чіпає `reviewer-core` взагалі — там усе вже є.

---

## 4. Клієнтська частина

### 4.0a Форматер (пишемо один раз)

`client/src/lib/format-usd.ts`:

```ts
/**
 * USD для вартості запуску: ≥3 значущі цифри, щоб дешевий прогін не
 * виглядав як «$0.01» чи, гірше, «$0.00». null/undefined → «—»:
 * «немає даних» і «безкоштовно» — різні речі.
 */
export function formatUsd(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v === 0) return '$0.00';
  const decimals = Math.max(2, 3 - Math.floor(Math.log10(Math.abs(v))) - 1);
  return `$${v.toFixed(Math.min(decimals, 8))}`;
}
```

| Вхід | Вихід |
|---|---|
| `0.0013452` | `$0.00135` |
| `0.014` | `$0.0140` |
| `0.06` | `$0.0600` |
| `1.234` | `$1.23` |
| `0` | `$0.00` |
| `null` | `—` |

Поруч — `format-usd.test.ts` із цією ж таблицею як тест-кейсами.

> Чому в `lib/`, а не поруч із компонентом: форматер потрібен і `RunCostBadge`
> (екрани 1-2), і плитці `Stat` у drawer (екран 3), яка бейджа не використовує.
> `formatTokens`/`formatSeconds` лежать усередині `RunTraceDrawer/helpers.ts`
> саме тому, що використовуються в одному місці.

### 4.0b `RunCostBadge` — спільний компонент екранів 1-2

```
client/src/components/run-cost-badge/
  RunCostBadge.tsx
  RunCostBadge.test.tsx
  index.ts        → export { RunCostBadge, default } from "./RunCostBadge";
```

Структура каталогу — за наявною конвенцією `client/src/components/`
(kebab-каталог, PascalCase-файл, реекспорт через `index.ts`; див.
`repo-not-found/`, `page-shell/`).

```tsx
/**
 * Вартість одного запуску. Два види:
 *   compact — самостійне число у комірці таблиці (список PR)
 *   inline  — хвіст мета-рядка разом із токенами (таймлайн запусків)
 * Немає даних → «—», ніколи «$0.00»: невідома вартість і безкоштовний
 * запуск — різні речі.
 */
export function RunCostBadge({
  cost,
  tokens,
  variant = 'compact',
}: {
  cost: number | null | undefined;
  /** Сума in+out; лише для variant='inline'. */
  tokens?: number | null;
  variant?: 'compact' | 'inline';
}) {
  if (variant === 'inline') {
    return (
      <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        {tokens != null && `${tokens.toLocaleString()} tok · `}
        {formatUsd(cost)}
      </span>
    );
  }
  return (
    <span className="tnum" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
      {formatUsd(cost)}
    </span>
  );
}
```

Drawer (екран 3) бейджа **не** використовує: там уже є атом
`Stat({ label, val })`, і бейдж усередині плитки дублював би її рамку —
плитка COST візуально розійшлася б із сусідніми DURATION/TOKENS/FINDINGS.
Спільним для всіх трьох екранів лишається `formatUsd()`.

### 4.1 Екран 1 — список Pull Requests (колонка COST)

Файли: `client/src/app/repos/[repoId]/pulls/`

- `constants.ts:27` — `GRID`: `"1fr 132px 92px 60px 118px 78px"` →
  вставити ширину колонки COST **між STATUS і UPDATED** (за макетом):
  `"1fr 132px 92px 60px 118px 76px 78px"`
- `constants.ts:42` — `COLUMN_KEYS`: додати `"cost"` перед `"updated"`
- `client/messages/en/prReview.json` — `list.columns.cost` = `"COST"`
- `_components/PRRow/PRRow.tsx` — нова комірка між STATUS і UPDATED:
  ```tsx
  <div style={s.costCell}>
    <RunCostBadge cost={pr.cost_usd} />
  </div>
  ```
- `styles.ts` — `costCell`: лише вирівнювання (`display:flex; alignItems:center`),
  як `scoreCell`; типографіку тримає сам бейдж

Порядок колонок у `COLUMN_KEYS` і в JSX `PRRow` **не пов'язані кодом** — це
два незалежні списки над спільним `GRID`. Змінювати треба обидва синхронно,
інакше заголовки поїдуть відносно комірок. Це головна пастка цього екрана.

> Макет показує ще колонку FINDINGS і кнопку «Run Review» у рядку — їх у
> поточному `PRRow` немає, і в цю фічу вони не входять.

### 4.2 Екран 2 — таймлайн запусків (рядок агента)

Файл: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx`

Правий стовпчик (рядки 189-191) зараз містить тільки час. За макетом під часом
з'являється другий рядок — токени й вартість:

```tsx
<div style={{ /* наявний правий стовпчик */ }}>
  {r.ran_at && <span>{new Date(r.ran_at).toLocaleTimeString()}</span>}
  {settled && (r.tokens_in != null || r.cost_usd != null) && (
    <RunCostBadge
      variant="inline"
      cost={r.cost_usd}
      tokens={(r.tokens_in ?? 0) + (r.tokens_out ?? 0)}
    />
  )}
</div>
```

Умова `settled` (`status === 'done'`) вже є в компоненті й уже
використовується для score та findings — беремо її, щоб запуск, що триває, або
failed не показував вартості. На макеті failed-рядок General Reviewer має
праворуч тільки час — саме це й вийде.

### 4.3 Екран 3 — Run Trace drawer (плитка COST)

Файл: `…/RunTraceDrawer/_components/TraceBody/TraceBody.tsx:62-66`

```tsx
<div style={s.statsRow}>
  <Stat label={t("trace.stat.duration")} val={formatSeconds(stats.duration_ms)} />
  <Stat label={t("trace.stat.tokens")} val={formatTokens(stats.tokens_in, stats.tokens_out)} />
  <Stat label={t("trace.stat.cost")} val={formatUsd(stats.cost_usd)} />
  <Stat label={t("trace.stat.findings")} val={stats.findings} />
</div>
```

- `client/messages/en/runs.json` → `trace.stat.cost` = `"COST"` — **інший файл
  перекладів, ніж у екранів 1-2**: `TraceBody` бере `useTranslations("runs")`,
  а не `"prReview"`. Ключ лягає поруч із `duration`/`tokens`/`findings`
  (`runs.json:39`)
- `s.statsRow` — змін не потребує (перевірено): `display:flex; gap:10` +
  `stat:{flex:1}`, drawer має фіксовані `DRAWER_WIDTH = 720`, отже четверта
  плитка отримує ~160px при ~75px тексту. `flex-wrap` не потрібен

Старі траси, збережені до цієї зміни, не мають ключа `cost_usd` у своєму
`jsonb` — тому поле й оголошене `nullish`; плитка покаже `—`.

---

## 5. План реалізації

Порядок такий, що кожен крок компілюється й перевіряється окремо.

| # | Крок | Файли | Перевірка |
|---|---|---|---|
| 1 | Колонка в схемі + міграція | `server/src/db/schema/runs.ts`, нова `0010_*.sql` | `pnpm db:generate && pnpm db:migrate`; `\d agent_runs` містить `cost_usd` |
| 2 | Контракти (обидві копії vendor) | `server/src/vendor/shared/contracts/{trace,platform}.ts` + дзеркало в `client/src/vendor/shared/` | `pnpm typecheck` у server і client |
| 3 | Запис вартості | `run-executor.ts`, `reviews/repository.ts`, `repository/run.repo.ts` | реальний запуск рев'ю → `select cost_usd from agent_runs` не NULL |
| 4 | Ендпоїнт списку PR | `modules/pulls/routes.ts` | `curl /repos/:id/pulls` містить `cost_usd` |
| 5 | `formatUsd` + `RunCostBadge` + тести | `client/src/lib/format-usd.ts`, `client/src/components/run-cost-badge/` | `pnpm test` у client |
| 6 | UI-екран 1 | `pulls/{constants,styles}.ts`, `PRRow.tsx`, `prReview.json` | колонка на місці, заголовки не з'їхали |
| 7 | UI-екран 2 | `RunHistory.tsx` | `tok · $` під часом; failed-рядок без вартості |
| 8 | UI-екран 3 | `TraceBody.tsx`, `runs.json` (не `prReview.json`!) | чотири плитки в ряд |
| 9 | Тести компонентів | `RunHistory.test.tsx`, `RunTraceDrawer.test.tsx` | фікстури вже мають `tokens_in/out` — додати `cost_usd` |

Кроки 1-4 — server, 5-9 — client; після кроку 4 API вже повний, тож клієнт
можна робити паралельно.

### Обов'язкове після кроку 2

`client/src/vendor/shared` — **окрема копія вручну**, і вона вже розійшлася з
канонічною в 5 файлах (`adapters.ts`, `contracts/{eval-ci,knowledge,productionize,trace}.ts`
— перевірено `diff -rq`, розбіжності косметичні, у коментарях). Тому:
**не копіювати файл цілком** — вносити ту саму правку точково, інакше
затреться наявний дрейф.

---

## 6. Критерії приймання

Зі слайда «перевірка Run Cost Badge» + наслідки D1-D4.

1. **Звірка цифр.** На одному реальному запуску: цифра в drawer = цифра в
   рядку таймлайну = `usage.cost` у логу = сума в дашборді OpenRouter.
2. **Формат читабельний.** ≥3 значущі цифри: `$0.00135`, ніколи `$0.01`
   замість реального `0.0013`.
3. **Немає даних → `—`.** Запуск, що триває, failed, cancelled та історичний
   (до міграції 0010) показують `—`, а не `$0.00`. Перевіряється штучно:
   `update agent_runs set cost_usd = null where id = …`.
4. **Нуль додаткових викликів моделі.** Кількість LLM-запитів на рев'ю до і
   після фічі однакова (видно в Live Log / у логах сервера).
5. **Три екрани.** Колонка COST у списку PR; `tok · $` у рядку таймлайну;
   плитка COST між TOKENS і FINDINGS у drawer.
6. **Заголовки списку не з'їхали.** `COLUMN_KEYS`, `GRID` і комірки `PRRow`
   узгоджені (візуальна перевірка на вузькому вікні).
7. **Старі траси не падають.** Відкриття trace-drawer для запуску, збереженого
   до цієї зміни, не кидає помилки зодо-валідації, плитка COST = `—`.

---

## 7. Поза скоупом

- Сумарна вартість PR по всіх запусках (наслідок D1) — окрема фіча.
- Бюджети, ліміти, алерти на перевитрату.
- Вартість на екранах Agent Performance / Eval Dashboard / CI Runs
  (`AgentStats.total_cost_usd`, `ci_runs.cost_usd` — заготовки під інші уроки).
- Позначка «оцінка vs реальна вартість» у UI (відхилено як D3, варіант 2).
- Бекфіл історичних рядків (відхилено як D4).

---

## 8. Ризики

| Ризик | Прояв | Пом'якшення |
|---|---|---|
| Ручна синхронізація vendor-копій | Клієнт бачить старий тип → `cost_usd` не типізовано, тихо `undefined` | Крок 2 — точкова правка обох копій, `pnpm typecheck` в обох пакетах |
| Дрейф порядку колонок у списку PR | Заголовки не над своїми комірками | Крок 6 змінює `GRID`, `COLUMN_KEYS` і `PRRow` в одному коміті |
| `seed.ts` не створює `agent_runs` | Після `db:seed` усі три екрани показують `—`; виглядає як баг фічі | Демонструвати на реальному запуску рев'ю, не на сіді |
| Модель поза прайс-буком і без `usage.cost` | Тихий `—` замість цифри | Очікувана поведінка (D3/D4); діагностика — Live Log запуску |
