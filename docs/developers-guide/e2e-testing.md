# End-to-End Testing

Full E2E tests drive a **real browser + the built extension + a real Mealie server**, then
assert the recipe actually landed in Mealie. They cover both shipping targets:

| Target | Tool | Loads | Background |
| --- | --- | --- | --- |
| **Chrome MV3** | Playwright | `.output/chrome-mv3` | service worker |
| **Firefox MV2** | Selenium + geckodriver | `.output/*-firefox.zip` (xpi) | persistent page |

There is no single tool that loads an unsigned extension in both browsers: Playwright can only
load Chromium extensions, and Firefox needs geckodriver's temporary-add-on install. So each
target has its own thin driver harness, and both share the TypeScript helpers in `e2e-shared/`.

## How it works

Both harnesses run the same flow:

1. Load the built extension.
2. Seed Mealie creds + import options into `storage.sync` from the popup context.
3. Open a recipe page in a tab. By default this is a **hermetic local fixture**
   (`e2e-shared/fixtures/recipe.html`, served by `fixture-server.ts`) so tests never depend
   on a live recipe site. Override with `E2E_RECIPE_URL` for a real live-scrape run.
4. Fire the **internal e2e trigger** — a `runtime.sendMessage` of type
   `mini-mealie/e2e/run-create-recipe` (see `utils/e2eMessaging.ts`), which runs the exact
   same `runCreateRecipe(tab)` path as the context-menu "Save to Mini Mealie" click.

   This message is the canonical trigger because it behaves identically in both targets:
   Chrome MV3 also has a keyboard command (`Ctrl+Shift+M`), but **Firefox MV2 has no
   `commands` block**, so a keyboard trigger can't work there.
5. Poll `GET /api/recipes` until a recipe appears whose `orgURL` matches the page
   (`orgURL`, not slug — Mealie suffixes duplicate slugs `-1`, `-2`, … so re-runs would
   otherwise fail).

## The Mealie backend (Docker)

`docker/mealie.e2e.yml` runs an ephemeral Mealie on SQLite (tmpfs, so every run is clean).
`e2e-shared/mealie-docker.ts` brings it up, waits for health, logs in with Mealie's default
`changeme@example.com` / `MyPassword`, mints an API token, and writes `.env.e2e`
(`E2E_MEALIE_SERVER`, `E2E_MEALIE_TOKEN`). Both harnesses auto-load `.env.e2e`.

You can skip Docker and point at any Mealie instance by exporting `E2E_MEALIE_SERVER` and
`E2E_MEALIE_TOKEN` yourself (these win over `.env.e2e`).

## Running it

Chrome, fully automated (up → build → test → down):

```
pnpm test:e2e:chromium:install   # one-time: fetch Playwright chromium
pnpm test:e2e                    # docker Mealie + build + chrome spec + teardown
```

Chrome, manual control:

```
pnpm test:e2e:up                 # start Mealie, write .env.e2e
pnpm build                       # build .output/chrome-mv3
pnpm test:e2e:chromium
pnpm test:e2e:down
```

Firefox:

```
pnpm test:e2e:gecko:setup        # one-time: non-snap Firefox + geckodriver
pnpm test:e2e:up                 # (if not already running)
pnpm test:e2e:gecko              # zip:firefox + run the Selenium harness
pnpm test:e2e:down
```

## Useful env vars

| Var | Default | Purpose |
| --- | --- | --- |
| `E2E_MEALIE_SERVER` / `E2E_MEALIE_TOKEN` | from `.env.e2e` | Mealie target (skip if unset) |
| `E2E_IMPORT_MODE` | `html` | `html` or `url` import mode |
| `E2E_RECIPE_URL` | local fixture | recipe to import; set a real URL for a live-scrape run |
| `E2E_FIXTURE_PORT` | `8730` | port for the local fixture server |
| `MEALIE_IMAGE` / `MEALIE_PORT` | `…/mealie:v2.8.0` / `9925` | Docker Mealie image / host port |
| `E2E_FIREFOX_XPI` | newest `.output/*-firefox.zip` | Firefox add-on to install |
| `E2E_HEADLESS` | on | set `0` to watch Firefox run |

## CI

`.github/workflows/e2e.yml` runs both targets on every PR to `main` (and `workflow_dispatch`):

- Docker + Compose ship on `ubuntu-latest`, so `test:e2e:up` brings up Mealie there exactly
  as it does locally.
- No secrets: Mealie is ephemeral and the API token is minted at runtime.
- Fully hermetic: the default recipe is the local fixture, so no third-party site can flake CI.
- Chrome uses the self-contained `pnpm test:e2e`; Firefox adds the `setup.sh` step.

To run on your own server instead of GitHub-hosted, change `runs-on` to `[self-hosted]` —
just ensure Docker is installed and the runner user is in the `docker` group. The harnesses
stay excluded from lint / tsc / vitest and from the AMO sources zip.
