# Web accessibility and visual regression

The web quality runner checks the deterministic demo dashboard at fixed desktop
and mobile viewports. Each viewport must pass:

- automated axe checks for WCAG 2.0, 2.1, and 2.2 A/AA rules;
- a Playwright screenshot comparison against the approved overview baseline.

The suite clears saved sessions and intercepts API requests to
`http://127.0.0.1:7000`, so it does not authenticate, mutate a workspace, or mix
real user data into test state.

## One-time browser setup

Install the Playwright-managed Chromium revision after installing dependencies or
updating Playwright:

```powershell
corepack pnpm quality:web:install
```

If the browser CDN is unavailable but system Chrome is installed, select that
channel explicitly:

```powershell
$env:PLAYWRIGHT_BROWSER_CHANNEL = "chrome"
```

Use one browser channel and operating-system image consistently for comparisons;
font rendering and browser versions can otherwise produce legitimate pixel
differences.

## Run the gates

```powershell
corepack pnpm quality:web
```

The command starts a dedicated Next.js development server on loopback port 3100,
runs desktop and mobile checks serially, and then stops the server. A violation or
pixel difference produces a nonzero exit code.

Failure artifacts are written to `test-results/playwright`. The HTML report is
written to `playwright-report`. Both directories are ignored by Git.

## Review and update baselines

Do not update screenshots merely to make a failure pass. First inspect the
received image and confirm the UI change is intentional. Then update only the
visual test:

```powershell
corepack pnpm --filter @relationship/web exec playwright test `
  --grep baseline `
  --update-snapshots
```

Commit the reviewed files under
`apps/web/e2e/__screenshots__/dashboard.e2e.ts`. Rerun
`corepack pnpm quality:web` without `--update-snapshots` to prove the new
baselines compare cleanly.

## Scope

Automated axe checks catch common issues such as insufficient contrast, missing
accessible names, and invalid ARIA. They do not replace keyboard, screen-reader,
zoom, cognitive, or user testing. Those manual and journey-level checks remain
separate release activities.
