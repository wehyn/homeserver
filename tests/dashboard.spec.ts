import { expect, test } from "@playwright/test";

test.describe("dashboard browser regressions", () => {
  test("serves the install manifest and service worker without private services", async ({ page, request }) => {
    const manifestResponse = await request.get("/manifest.webmanifest");
    expect(manifestResponse.ok()).toBeTruthy();
    const manifest = await manifestResponse.json();
    expect(manifest.lang).toBe("en");
    expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === "maskable")).toBeTruthy();

    const workerResponse = await request.get("/sw.js");
    expect(workerResponse.ok()).toBeTruthy();
    expect(await workerResponse.text()).toContain("NetworkFirst");
    await page.goto("/");
    await expect(page.locator("main.launcher")).toBeVisible();
  });

  test("keeps responsive Web UI controls usable at a phone width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const form = page.locator(".app-form");
    if (await form.count()) {
      await expect(form.locator("#app-new-url-protocol")).toBeVisible();
      await expect(form.locator("#app-new-url-port")).toBeVisible();
    }
  });
});
