# server — архітектура

Практичний огляд `@devdigest/api` для того, хто вперше сюди заходить.
Діаграми та повний перелік ендпоінтів — у [../README.md](../README.md);
правила роботи — у [../CLAUDE.md](../CLAUDE.md).

## Три шари

```
routes (modules/*)  →  service  →  repository  →  Drizzle/Postgres
                          ↓
                    container (DI)  →  adapters (llm, github, git, secrets, …)
```

- **`src/modules/<feature>/`** — один Fastify-плагін на фічу (`repos`, `pulls`,
  `polling`, `reviews`, `agents`, `repo-intel`, `settings`, `workspace`).
  Реєструються статично в `modules/index.ts` — жодного автозавантаження по
  файловій системі, щоб порядок був явним.
- **`src/adapters/<port>/<impl>.ts`** — усе зовнішнє за портом: LLM-провайдери,
  GitHub, git, ast-grep, embedder, tokenizer, secrets. У тестах підміняються
  через `src/adapters/mocks.ts`.
- **`src/platform/`** — конфіг (`config.ts`) і DI-контейнер (`container.ts`).

## Що варто знати наперед

**Плагіни реєструються ДО модулів.** Інакше інкапсульовані модульні плагіни не
успадкують helmet / cors / rate-limit / SSE і спільний error handler.

**Ключі не потрібні для старту.** `loadConfig` позначає кожен секрет
опціональним; сервер підіймається без жодного ключа. Секрети живуть у
`~/.devdigest/secrets.json` (mode 0600) і **ніколи** не потрапляють у
`AppConfig` чи БД — їх читає лише `LocalSecretsProvider`.

**Деградація замість падіння.** Немає `GITHUB_TOKEN` або GitHub недоступний —
`GET /repos/:id/pulls` логує `warn` і віддає вже збережені PR. Локальні дані
важливіші за свіжість.

**Контейнер кешує клієнтів.** `container.github()` кидає `ConfigError`, якщо
токена немає, і кешує клієнт після першого успіху. Виклики загорнуті в
try/catch на рівні маршруту — саме там ухвалюється рішення «деградувати чи
впасти».

## Міграції

Не застосовуються на старті — `pnpm db:migrate` вручну. Змерджені файли в
`src/db/migrations/` незмінні: додавай нову міграцію, не редагуй стару.

Схема вже містить таблиці майбутніх уроків — порожня таблиця не означає
«мертвий код».

## Тести

| Вид | Де | Як запускати |
|---|---|---|
| unit / integration | `test/*.test.ts` | `pnpm test` |
| з реальною БД | `test/*.it.test.ts` (testcontainers, самі скіпаються без Docker) | те саме |

Суфікс `.it.test.ts` — **обов'язковий** для тестів із БД, інакше ламається
поділ на unit та integration.
