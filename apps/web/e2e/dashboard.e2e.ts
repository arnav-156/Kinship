import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("demo dashboard quality gates", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.sessionStorage.clear());
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("http://127.0.0.1:7000/**", (route) => route.abort("connectionrefused"));
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: "Good evening, there" }),
    ).toBeVisible();
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation: none !important;
          caret-color: transparent !important;
          transition: none !important;
        }
      `,
    });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
  });

  test("has no automatically detectable WCAG A/AA violations", async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(
      results.violations,
      results.violations
        .map(
          (violation) =>
            `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
        )
        .join("\n"),
    ).toEqual([]);
  });

  test("matches the approved overview baseline", async ({ page }) => {
    await expect(page).toHaveScreenshot("overview.png");
  });
});
