import { expect, test } from "./fixtures";

test("guide visibility gates copy-density independently across routes and card layouts", async ({
  page,
}) => {
  await page.goto("/?guide=on&exp.planning-guide-detail=control&exp.arrival-flow=control", {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: "Decision inspector", exact: true }).click();
  await page.locator(".inspector-decisions summary").click();
  await expect(page.locator(".hero .planning-prompt")).toHaveText(/Plan at your own pace/);
  await expect(page.locator(".destination-card .planning-prompt")).toHaveCount(6);
  await expect(page.locator(".hotel-card .planning-prompt")).toHaveCount(3);
  await expect(page.locator(".planning-prompt-expanded")).toHaveCount(0);
  await expect(page.locator(".decision-list")).toContainText("rule: planning-guide-flag");
  await page.getByLabel("planning-guide-detail assignment").selectOption("treatment");
  await expect(page.locator(".hero .planning-prompt")).toContainText("narrow the collection");
  await expect(page.locator(".planning-prompt-expanded")).toHaveCount(10);
  await expect(page.locator(".decision-list")).toContainText(
    "experiment: planning-guide-detail / treatment",
  );

  await page.locator("#destination-select").selectOption("kyoto");
  await page.getByRole("button", { name: /Explore stays/ }).click();
  await expect(page).toHaveURL(/destination=kyoto/);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Decision inspector", exact: true }).click();
  await expect(page.locator(".destination-intro .planning-prompt-expanded")).toHaveCount(1);
  await expect(page.locator(".destination-card .planning-prompt-expanded")).toHaveCount(1);
  await expect(page.getByLabel("Planning guide flag")).toHaveValue("on");
  await expect(page.getByLabel("planning-guide-detail assignment")).toHaveValue("treatment");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Home", exact: true })
    .click();
  await expect(page.locator(".hero .planning-prompt")).toContainText("narrow the collection");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Destinations", exact: true })
    .click();
  await expect(page.locator(".destination-intro .planning-prompt")).toContainText("Select a card");
  await expect(page.locator(".image-card .planning-prompt-expanded")).toHaveCount(7);
  await page.getByRole("button", { name: "Decision inspector", exact: true }).click();
  await page.locator(".inspector-decisions summary").click();
  await page.getByLabel("arrival-flow assignment").selectOption("treatment");
  await expect(page.locator(".compact-card .planning-prompt-expanded")).toHaveCount(7);
  await page.getByLabel("Planning guide flag").selectOption("off");
  await expect(page.locator(".planning-prompt")).toHaveCount(0);
  await expect(page.getByLabel("planning-guide-detail assignment")).toHaveValue("treatment");
  await expect(page.locator(".decision-list")).toContainText(
    "experiment: planning-guide-detail / treatment",
  );
  await page.getByLabel("Planning guide flag").selectOption("on");
  await expect(page.locator(".compact-card .planning-prompt-expanded")).toHaveCount(7);

  // Same-path card navigation must retain inspector open/filter state.
  await page.getByRole("searchbox", { name: "Filter experiments" }).fill("planning");
  await page.getByRole("link", { name: /Bali Jungle hideaways/ }).click();
  await expect(page).toHaveURL(/destination=bali/);
  await expect(page.getByRole("complementary", { name: "Decision inspector" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Filter experiments" })).toHaveValue("planning");
  await expect(page.locator(".compact-card .planning-prompt-expanded")).toHaveCount(1);
  await expect(page.getByLabel("Planning guide flag")).toHaveValue("on");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Home", exact: true })
    .click();
  await expect(page.getByRole("complementary", { name: "Decision inspector" })).toBeHidden();
  await page.getByRole("button", { name: "Decision inspector", exact: true }).click();
  await expect(page.getByRole("searchbox", { name: "Filter experiments" })).toHaveValue("");

  await page.goto("/destinations?destination=kyoto&guide=broken&exp.planning-guide-detail=bad", {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: /^Decision inspector/ }).click();
  await expect(page.locator(".planning-prompt")).toHaveCount(0);
  await expect(page.locator(".ignored")).toContainText("guide=broken");
  await expect(page.locator(".ignored")).toContainText("exp.planning-guide-detail=bad");
  await expect(page.locator(".destination-card")).toHaveCount(1);
});

test("JavaScript-disabled mobile SSR includes legible expanded guide cues", async ({
  browser,
}, testInfo) => {
  const noJs = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await noJs.newPage();
    await page.goto("/?guide=on&exp.planning-guide-detail=treatment&exp.arrival-flow=treatment");
    await expect(page.locator(".hero .planning-prompt")).toContainText("narrow the collection");
    await expect(page.locator(".hero .planning-prompt")).toHaveCSS("color", "rgb(244, 227, 199)");
    await expect(page.locator(".compact-card .planning-prompt-expanded")).toHaveCount(6);
    await expect(page.locator(".planning-prompt-expanded")).toHaveCount(10);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await testInfo.attach("mobile-guided-ssr", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    await page.goto("/destinations?guide=on&exp.planning-guide-detail=treatment");
    await expect(page.locator(".destination-intro .planning-prompt-expanded")).toHaveCount(1);
    await expect(page.locator(".destination-card .planning-prompt-expanded")).toHaveCount(7);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
  } finally {
    await noJs.close();
  }
});
