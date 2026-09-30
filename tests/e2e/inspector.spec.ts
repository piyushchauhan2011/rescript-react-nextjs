import { expect, test } from "./fixtures";

test("floating inspector filters controls without changing values and restores focus", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?exp.arrival-flow=control&guide=on", { waitUntil: "networkidle" });
  const launcher = page.getByRole("button", { name: "Decision inspector", exact: true });
  const panel = page.getByRole("complementary", { name: "Decision inspector" });
  const filter = page.getByRole("searchbox", { name: "Filter experiments" });
  await expect(launcher).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(launcher).toBeInViewport();
  await launcher.click();
  await expect(panel).toBeVisible();
  await expect(launcher).toHaveAttribute("aria-expanded", "true");
  await expect(launcher).toHaveAttribute(
    "aria-controls",
    (await panel.getAttribute("id")) as string,
  );
  await expect(filter).toBeFocused();
  const bounds = await panel.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  expect(
    await page
      .locator(".inspector-body")
      .evaluate((element) => element.scrollHeight > element.clientHeight),
  ).toBe(true);
  await testInfo.attach("mobile-inspector", {
    body: await page.screenshot(),
    contentType: "image/png",
  });

  await filter.fill("ARRIVAL");
  await expect(page.locator(".inspector-experiment")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: /Experiments/ })).toContainText("1 of 3");
  await page.getByLabel("arrival-flow assignment").selectOption("treatment");
  await expect(page.locator(".hero")).toHaveAttribute("data-hero-layout", "split");
  await expect(page.locator(".inspector-experiment")).toContainText("Assigned: treatment");
  await expect(filter).toHaveValue("ARRIVAL");
  await page.locator(".inspector-decisions summary").click();
  await expect(page.locator(".decision-list")).toContainText(
    "experiment: arrival-flow / treatment",
  );
  const resolvedPaths = await page.locator(".decision-list dt").allTextContents();
  const resolvedValues = await page.locator(".decision-list dd").allTextContents();
  expect(resolvedPaths).toEqual([
    "hero.layout",
    "search.layout",
    "destinationCard.layout",
    "destinations.columns",
    "offers.visible",
    "planningGuide.visible",
    "planningGuide.detail",
  ]);
  await filter.fill("not-registered");
  await expect(page.getByText(/No experiments match/)).toBeVisible();
  await expect(page.locator(".inspector-experiment")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Experiments/ })).toContainText("0 of 3");
  expect(await page.locator(".decision-list dt").allTextContents()).toEqual(resolvedPaths);
  expect(await page.locator(".decision-list dd").allTextContents()).toEqual(resolvedValues);
  await expect(page.locator(".hero")).toHaveAttribute("data-hero-layout", "split");
  await filter.press("Escape");
  await expect(panel).toBeHidden();
  await expect(launcher).toBeFocused();
  await launcher.click();
  await expect(filter).toBeFocused();
  await filter.fill("");
  await page.getByRole("button", { name: "Close decision inspector" }).click();
  await expect(launcher).toBeFocused();
  await launcher.click();
  await launcher.click();
  await expect(panel).toBeHidden();
  await expect(launcher).toBeFocused();

  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Destinations", exact: true })
    .click();
  await expect(page).toHaveURL(/exp.arrival-flow=treatment/);
  await expect(page.locator(".compact-card")).toHaveCount(7);
  await expect(page.locator(".destination-intro .planning-prompt")).toBeVisible();
  await expect(launcher).toHaveAttribute("aria-expanded", "false");
});

test("opposite browser contexts remain isolated through query navigation", async ({ browser }) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const errors: string[] = [];
  try {
    const first = await firstContext.newPage();
    const second = await secondContext.newPage();
    for (const page of [first, second]) {
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") {
          errors.push(message.text());
        }
      });
    }
    await first.goto("/?exp.arrival-flow=treatment", { waitUntil: "networkidle" });
    await second.goto("/?exp.arrival-flow=control", { waitUntil: "networkidle" });
    await expect(first.locator(".hero")).toHaveAttribute("data-hero-layout", "split");
    await expect(second.locator(".hero")).toHaveAttribute("data-hero-layout", "immersive");
    const firstVisitor = (await firstContext.cookies()).find(
      (cookie) => cookie.name === "visitorId",
    )!.value;
    const secondVisitor = (await secondContext.cookies()).find(
      (cookie) => cookie.name === "visitorId",
    )!.value;
    expect(firstVisitor).not.toBe(secondVisitor);
    await first.getByRole("button", { name: "Decision inspector", exact: true }).click();
    await first.getByLabel("arrival-flow assignment").selectOption("control");
    await expect(first.locator(".hero")).toHaveAttribute("data-hero-layout", "immersive");
    await expect(second.locator(".hero")).toHaveAttribute("data-hero-layout", "immersive");
    await second.getByRole("button", { name: "Decision inspector", exact: true }).click();
    await second.getByLabel("arrival-flow assignment").selectOption("treatment");
    await expect(second.locator(".hero")).toHaveAttribute("data-hero-layout", "split");
    await expect(first.locator(".hero")).toHaveAttribute("data-hero-layout", "immersive");
    await first.reload();
    await expect(first.locator(".hero")).toHaveAttribute("data-hero-layout", "immersive");
    await expect(second.locator(".hero")).toHaveAttribute("data-hero-layout", "split");
    expect(errors).toEqual([]);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

test("malformed preview controls remain visible and Auto removes only its query field", async ({
  page,
}) => {
  await page.goto(
    "/destinations?destination=kyoto&country=XX&offers=broken&guide=broken&exp.arrival-flow=invalid",
    { waitUntil: "networkidle" },
  );
  await page.getByRole("button", { name: /^Decision inspector/ }).click();
  for (const [label, value] of [
    ["Visitor country", "XX"],
    ["Seasonal offers flag", "broken"],
    ["Planning guide flag", "broken"],
    ["arrival-flow assignment", "invalid"],
  ]) {
    await expect(page.getByLabel(label)).toHaveValue(value);
  }
  await expect(page.locator(".ignored")).toContainText("offers=broken");
  await expect(page.locator(".ignored")).toContainText("guide=broken");
  await expect(page.locator(".ignored")).toContainText("exp.arrival-flow=invalid");
  await page.getByLabel("arrival-flow assignment").selectOption("auto");
  await expect(page).not.toHaveURL(/exp\.arrival-flow=/);
  const query = new URL(page.url()).searchParams;
  expect(query.get("destination")).toBe("kyoto");
  expect(query.get("guide")).toBe("broken");
  expect(query.get("offers")).toBe("broken");
  await expect(page.locator(".destination-card")).toHaveCount(1);
});
