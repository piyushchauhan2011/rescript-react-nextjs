import { resolveDecisionRequest } from "@repo/core/DecisionRequest";
import { expect, test } from "./fixtures";

test("navigation preserves selected layouts, rules, and destination filters", async ({
  page,
}, testInfo) => {
  await page.goto(
    "/?exp.arrival-flow=control&exp.destination-density=control&country=US&offers=off",
    { waitUntil: "networkidle" },
  );
  await expect(page.locator(".hero")).toHaveAttribute("data-hero-layout", "immersive");
  await expect(page.locator(".hero")).toHaveAttribute("data-search-layout", "overlay");
  await expect(page.locator(".destination-grid")).toHaveAttribute("data-columns", "three");
  await expect(page.locator(".image-card")).toHaveCount(6);
  await expect(page.locator(".hotel-card")).toHaveCount(3);
  await expect(page.locator(".offers")).toHaveCount(0);
  await expect(page.locator("main > section")).toHaveClass([/hero/, /places/, /featured/]);
  await page.getByRole("button", { name: "Decision inspector", exact: true }).click();
  await page.locator(".inspector-decisions summary").click();
  await page.getByLabel("arrival-flow assignment").selectOption("treatment");
  await expect(page.locator(".hero")).toHaveAttribute("data-hero-layout", "split");
  await page.getByLabel("destination-density assignment").selectOption("treatment");
  await expect(page.locator(".hero")).toHaveAttribute("data-search-layout", "inline");
  await expect(page.locator(".compact-card")).toHaveCount(6);
  await expect(page.locator(".destination-grid")).toHaveAttribute("data-columns", "two");
  await expect(page.locator(".decision-list")).toContainText(
    "experiment: arrival-flow / treatment",
  );
  await expect(page.locator(".decision-list")).toContainText(
    "experiment: destination-density / treatment",
  );

  await page.getByLabel("Visitor country").selectOption("IN");
  await expect(page.getByLabel("Visitor country")).toHaveValue("IN");
  await page.getByLabel("Seasonal offers flag").selectOption("on");
  await expect(page.locator(".offers")).toBeVisible();
  await expect(page.locator("main > section")).toHaveClass([
    /hero/,
    /places/,
    /featured/,
    /offers/,
  ]);
  await expect(page.locator(".decision-list")).toContainText("rule: india-seasonal-offers");
  await page.getByLabel("Seasonal offers flag").selectOption("off");
  await expect(page.locator(".offers")).toHaveCount(0);
  await page.getByLabel("Seasonal offers flag").selectOption("on");
  await expect(page.locator(".offers")).toBeVisible();
  await page.getByLabel("Visitor country").selectOption("US");
  await expect(page.locator(".offers")).toHaveCount(0);
  await page.getByLabel("Visitor country").selectOption("IN");
  await expect(page.locator(".offers")).toBeVisible();
  await testInfo.attach("desktop-treatment", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  await page.locator("#destination-select").selectOption("kyoto");
  await page.getByRole("button", { name: /Explore stays/ }).click();
  await expect(page).toHaveURL(/\/destinations\?.*destination=kyoto/);
  await page.waitForLoadState("networkidle");
  const query = new URL(page.url()).searchParams;
  expect(query.get("exp.arrival-flow")).toBe("treatment");
  expect(query.get("exp.destination-density")).toBe("treatment");
  expect(query.get("country")).toBe("IN");
  expect(query.get("offers")).toBe("on");
  await page.getByRole("button", { name: "Decision inspector", exact: true }).click();
  await page.locator(".inspector-decisions summary").click();
  await expect(page.locator(".compact-card")).toHaveCount(1);
  await expect(page.locator(".destination-grid")).toHaveAttribute("data-columns", "two");
  await expect(page.getByLabel("Visitor country")).toHaveValue("IN");
  await page.getByLabel("arrival-flow assignment").selectOption("control");
  await expect(
    page.locator(".inspector-experiment").filter({ hasText: "arrival-flow" }),
  ).toContainText("Assigned: control");
  await expect(page.locator(".image-card")).toHaveCount(1);
  await expect(page).toHaveURL(/destination=kyoto/);
});

test("unknown destination filters preserve rejected previews and main navigation", async ({
  page,
}) => {
  await page.goto("/destinations?destination=not-a-place&exp.arrival-flow=invalid", {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: /^Decision inspector/ }).click();
  await expect(page.getByText("No destination found")).toBeVisible();
  await expect(page.locator(".ignored")).toContainText("exp.arrival-flow=invalid");
  await page.getByRole("link", { name: /Clear destination filter/ }).click();
  await expect(page.locator(".destination-card")).toHaveCount(7);
  expect(new URL(page.url()).searchParams.has("destination")).toBe(false);
  expect(new URL(page.url()).searchParams.get("exp.arrival-flow")).toBe("invalid");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Home", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: /Go somewhere/ })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Destinations", exact: true })
    .click();
  await expect(page.locator(".destination-card")).toHaveCount(7);
});

test("selected layouts and guide cues render without JavaScript", async ({ browser }) => {
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  try {
    const ssrPage = await noJs.newPage();
    await ssrPage.goto(
      "/?exp.arrival-flow=treatment&exp.destination-density=treatment&country=IN&offers=on&guide=on&exp.planning-guide-detail=treatment",
    );
    await expect(ssrPage.getByRole("heading", { name: /Go somewhere/ })).toBeVisible();
    await expect(ssrPage.locator(".hero")).toHaveAttribute("data-hero-layout", "split");
    await expect(ssrPage.locator(".compact-card")).toHaveCount(6);
    await expect(ssrPage.locator(".offers")).toBeVisible();
    await expect(ssrPage.locator(".planning-prompt-expanded")).toHaveCount(10);
    await ssrPage.goto("/destinations");
    await expect(ssrPage.locator(".destination-card")).toHaveCount(7);
  } finally {
    await noJs.close();
  }
});

test("first response renders assignments for the UUID issued in that same response", async ({
  browser,
}) => {
  // No hydration/navigation can repair a wrong first-render identity in this context.
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    const cookie = (await context.cookies()).find((item) => item.name === "visitorId");
    expect(cookie).toBeDefined();
    expect(cookie!.value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe("Lax");
    expect(cookie!.path).toBe("/");
    const expected = resolveDecisionRequest({
      page: "home",
      search: {},
      visitorId: cookie!.value,
      production: false,
      rollout: { disabledIds: [], seasonalOffers: false, planningGuide: false },
    });
    await expect(page.locator(".hero")).toHaveAttribute(
      "data-hero-layout",
      expected.values["hero.layout"],
    );
    await expect(page.locator(".hero")).toHaveAttribute(
      "data-search-layout",
      expected.values["search.layout"],
    );
    await expect(page.locator(".destination-grid")).toHaveAttribute(
      "data-columns",
      expected.values["destinations.columns"],
    );
    await expect(page.locator(".destination-grid")).toHaveAttribute(
      "data-card-layout",
      expected.values["destinationCard.layout"],
    );
    await expect(page.locator(".destination-card")).toHaveCount(6);
    const assignments = page.locator(".inspector-experiment");
    for (const [id, variant] of Object.entries(expected.assignments)) {
      await expect(assignments.filter({ hasText: id })).toContainText(`Assigned: ${variant}`);
    }
  } finally {
    await context.close();
  }
});

test("cookie preserves natural assignments across reload and mobile route navigation", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Decision inspector", exact: true }).click();
  const assigned = await page.locator(".inspector-assignment").allTextContents();
  const visitor = (await page.context().cookies()).find(
    (cookie) => cookie.name === "visitorId",
  )!.value;
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Decision inspector", exact: true }).click();
  await expect(page.locator(".inspector-assignment")).toHaveText(assigned);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Close decision inspector" }).click();
  await testInfo.attach("mobile-home", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Destinations", exact: true })
    .click();
  await expect(page.locator(".destination-card")).toHaveCount(7);
  await page.getByRole("button", { name: "Decision inspector", exact: true }).click();
  await expect(page.locator(".inspector-assignment")).toHaveText(assigned);
  expect(
    (await page.context().cookies()).find((cookie) => cookie.name === "visitorId")!.value,
  ).toBe(visitor);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Close decision inspector" }).click();
  await testInfo.attach("mobile-destinations", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("bounded image responses are publicly cacheable", async ({ request }) => {
  const transformed = await request.get("/image/480/hero-1280.webp");
  expect(transformed.status()).toBe(200);
  expect(transformed.headers()["content-type"]).toBe("image/webp");
  expect(transformed.headers()["cache-control"]).toBe("public, max-age=604800");
  const original = await request.get("/images/hero-1280.webp");
  expect(original.status()).toBe(200);
  expect(original.headers()["content-type"]).toMatch(/^image\/webp/);
  expect(original.headers()["cache-control"]).not.toMatch(/private|no-store/);
  for (const path of [
    "/image/640/hero-1280.webp",
    "/image/480/missing.webp",
    "/image/480/%2e%2e%2fhero-1280.webp",
    "/image/480/hero-1280.webp/extra",
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
    expect(await response.text(), path).toBe("Image not found");
  }
});
