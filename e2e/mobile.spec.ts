import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => {
    console.error(`Browser page error: ${error.message}`);
  });
});

test("plans a dinner and opens the pantry review", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "This week", exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "Pantry" }).click();
  await expect(page.getByRole("heading", { name: "Pantry" })).toBeVisible();
  await page.getByRole("button", { name: "Shop" }).click();
  await expect(
    page.getByRole("heading", { name: "Pantry check" })
  ).toBeVisible();
});

test("opens cooking feedback from a planned meal", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /Mark Smoky Chicken Tacos cooked/i })
    .click();
  await expect(
    page.getByRole("heading", { name: /How did Smoky Chicken Tacos go/i })
  ).toBeVisible();
  const intentControl = page.locator(".adjustment-builder .segmented-control");
  await expect(intentControl.getByText("Actually used")).toBeVisible();
  await expect(intentControl.getByText("Change next time")).toBeVisible();
});
