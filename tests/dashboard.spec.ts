import { expect, test } from "@playwright/test";

type DashboardApp = {
  id: string;
  name: string;
  description: string;
  category: string;
  url: string;
  icon: string;
  color: string;
  status: "online" | "degraded" | "offline" | "unknown";
  source: "manual" | "docker";
  isVisible: boolean;
  sortOrder: number;
};

const apps: DashboardApp[] = [{
  id: "demo",
  name: "Demo service",
  description: "A deterministic fixture",
  category: "Other",
  url: "https://demo.invalid",
  icon: "",
  color: "#b9e394",
  status: "online",
  source: "manual",
  isVisible: true,
  sortOrder: 0,
}];

const overview = {
  uptime: "1h 2m",
  cpu: 12.5,
  cpuCores: 4,
  temperatureC: null,
  powerWatts: null,
  powerSource: null,
  memory: 37.5,
  memoryUsed: "3.0 GB",
  memoryTotal: "8 GB",
  storage: 42,
  storageUsed: "42 GB",
  storageAvailable: "58 GB",
  storageTotal: "100 GB",
  network: "Local network",
  updatedAt: "2026-09-02T12:00:00.000Z",
};

const historyPoints = [
  { timestamp: "2026-09-02T11:56:00.000Z", cpu: 11.2, memory: 36.9, storage: 42, temperatureC: null, powerWatts: null },
  { timestamp: "2026-09-02T11:57:00.000Z", cpu: 12.5, memory: 37.5, storage: 42, temperatureC: null, powerWatts: null },
  { timestamp: "2026-09-02T11:58:00.000Z", cpu: 13.1, memory: 38.2, storage: 42, temperatureC: null, powerWatts: null },
];

async function installDashboardFixtures(page: import("@playwright/test").Page, fixtureApps = apps) {
  await page.route("**/api/apps", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { apps: fixtureApps, docker: { available: false, status: "unavailable", warnings: [], updatedAt: null } } });
    return route.fulfill({ json: { app: fixtureApps[0] } });
  });
  await page.route("**/api/activity", (route) => route.fulfill({ json: { activities: [] } }));
  await page.route("**/api/overview", (route) => route.fulfill({ json: overview }));
  await page.route("**/api/health**", (route) => route.fulfill({ json: { status: "online", latency: 20, statusCode: 200 } }));
  await page.route("**/api/metrics/history**", (route) => route.fulfill({ json: { minutes: 5, points: historyPoints } }));
  await page.route("**/api/processor/processes", (route) => route.fulfill({ json: {
    updatedAt: "2026-09-02T12:00:00.000Z",
    cpuPercent: 12.5,
    cpuCores: 4,
    loadAverage: { one: 0.2, five: 0.3, fifteen: 0.4 },
    sampling: false,
    partial: true,
    omittedCount: 2,
    totalCount: 3,
    returnedCount: 1,
    unreadableCount: 2,
    policyOmittedCount: 0,
    policyOmittedReason: null,
    warnings: ["2 processes were unavailable while scanning."],
    processes: [{ name: "node", command: "node server", pid: 42, user: "dei", cpuPercent: 8, rssBytes: 1024 * 1024, memoryPercent: 1.2 }],
  } }));
  await page.route("**/api/memory/processes", (route) => route.fulfill({ json: {
    updatedAt: "2026-09-02T12:00:00.000Z",
    totalBytes: 8 * 1024 * 1024 * 1024,
    usedBytes: 3 * 1024 * 1024 * 1024,
    availableBytes: 5 * 1024 * 1024 * 1024,
    usedPercent: 37.5,
    partial: true,
    omittedCount: 2,
    totalCount: 3,
    returnedCount: 1,
    unreadableCount: 2,
    policyOmittedCount: 0,
    policyOmittedReason: null,
    warnings: ["2 processes were unavailable while scanning."],
    processes: [{ name: "node", command: "node server", pid: 42, user: "dei", rssBytes: 1024 * 1024, memoryPercent: 1.2 }],
  } }));
}

test.describe("dashboard browser regressions", () => {
  test("serves install metadata and network-first service worker without private services", async ({ page, request }) => {
    await installDashboardFixtures(page);
    const manifestResponse = await request.get("/manifest.webmanifest");
    expect(manifestResponse.ok()).toBeTruthy();
    const manifest = await manifestResponse.json();
    expect(manifest.lang).toBe("en");
    expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === "maskable")).toBeTruthy();

    const workerResponse = await request.get("/sw.js");
    expect(workerResponse.ok()).toBeTruthy();
    expect(await workerResponse.text()).toMatch(/fetch\(request\)[\s\S]*cache\.match/);
    await page.goto("/");
    await expect(page.locator("main.launcher")).toBeVisible();
  });

  test("keeps responsive Web UI controls usable at phone widths", async ({ page }) => {
    const hostLocalApp = { ...apps[0], dockerProject: "demo", dockerService: "web", url: "http://localhost:8080" };
    await installDashboardFixtures(page, [hostLocalApp]);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/");
      await page.getByRole("button", { name: "Application management" }).click();
      await page.getByRole("button", { name: "Edit Demo service" }).click();
      await expect(page.locator("#app-demo-url-protocol")).toBeVisible();
      await expect(page.locator("#app-demo-url-host")).toBeVisible();
      await expect(page.locator("#app-demo-url-port")).toBeVisible();
      await expect(page.locator("main.launcher")).toHaveCSS("overflow-x", "hidden");
      await page.getByRole("button", { name: "Close application modal" }).click();
    }
  });

  test("contains settings focus, restores the trigger, and exposes the TLS toggle", async ({ page }) => {
    await installDashboardFixtures(page);
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "Application management" });
    await trigger.click();
    await expect(page.getByRole("dialog", { name: "Application management" })).toBeVisible();
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Application details" });
    await expect(dialog).toBeVisible();
    await expect(page.getByText(/favorite/i)).toHaveCount(0);
    const toggle = page.getByRole("button", { name: "Allow self-signed TLS" });
    await expect(toggle).toHaveAttribute("aria-describedby", /description/);
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.press("Space");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Application management" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("aria-label"))).toBe("Application management");
  });

  test("resynchronizes application form fields when switching records", async ({ page }) => {
    const secondApp = { ...apps[0], id: "second", name: "Second service", description: "Second description", dockerProject: "demo", dockerService: "second", url: "http://localhost:9090" };
    await installDashboardFixtures(page, [{ ...apps[0], dockerProject: "demo", dockerService: "first", url: "http://localhost:8080" }, secondApp]);
    await page.goto("/");
    await page.getByRole("button", { name: "Application management" }).click();
    await page.getByRole("button", { name: "Edit Demo service" }).click();
    await expect(page.locator("#app-demo-title")).toHaveValue("Demo service");
    await page.getByRole("button", { name: "All applications" }).click();
    await page.getByRole("button", { name: "Edit Second service" }).click();
    await expect(page.locator("#app-second-title")).toHaveValue("Second service");
    await expect(page.locator("#app-second-description")).toHaveValue("Second description");
    await expect(page.locator("#app-second-url-port")).toHaveValue("9090");
  });

  test("renders metrics text alternatives and accessible process sorting", async ({ page }) => {
    await installDashboardFixtures(page);
    await page.goto("/");
    await page.getByRole("button", { name: "View cpu details" }).click();
    const dialog = page.getByRole("dialog", { name: "Processor" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("img", { name: /CPU usage over/ })).toBeVisible();
    await expect(dialog.getByRole("table", { name: /CPU readings/ })).toBeVisible();
    await expect(dialog.getByRole("columnheader", { name: /CPU %/ })).toHaveAttribute("aria-sort", "descending");
    await expect(dialog.getByRole("button", { name: /Sort by CPU %/ })).toBeVisible();
    await expect(dialog.getByText(/2 unavailable/)).toBeVisible();
    await expect(dialog.getByText("1 / 3").last()).toBeVisible();
    await page.getByRole("button", { name: "Close processor details" }).click();
  });

  test("marks the launcher and app routes as structural performance boundaries", async ({ page }) => {
    await installDashboardFixtures(page);
    const apiRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/")) apiRequests.push(new URL(request.url()).pathname);
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main.launcher")).toBeVisible();
    await expect(page.getByRole("link", { name: "Demo service" })).toBeVisible();
    await expect.poll(() => apiRequests.filter((path) => path === "/api/apps").length).toBe(1);
    await expect(page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).resolves.toBeTruthy();
    expect(apiRequests.filter((path) => path === "/api/health").length).toBeLessThanOrEqual(1);
  });

  test("does not poll health while hidden and refreshes when visible again", async ({ page }) => {
    await installDashboardFixtures(page);
    let healthRequests = 0;
    await page.route("**/api/health**", (route) => {
      healthRequests += 1;
      return route.fulfill({ json: { status: "online", latency: 20, statusCode: 200 } });
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: "Demo service" })).toBeVisible();
    const initialRequests = healthRequests;
    await page.evaluate(() => Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }));
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.waitForTimeout(100);
    expect(healthRequests).toBe(initialRequests);
    await page.evaluate(() => Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }));
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect.poll(() => healthRequests).toBeGreaterThan(initialRequests);
  });

  test("shows an explicit offline state and retries after reconnecting", async ({ page }) => {
    await installDashboardFixtures(page);
    await page.goto("/");
    await page.evaluate(() => Object.defineProperty(navigator, "onLine", { configurable: true, value: false }));
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(page.getByRole("status").filter({ hasText: "You’re offline" })).toBeVisible();
    await page.evaluate(() => Object.defineProperty(navigator, "onLine", { configurable: true, value: true }));
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.getByRole("status").filter({ hasText: "You’re offline" })).toBeHidden();
  });
});
