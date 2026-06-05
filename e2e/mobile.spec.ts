import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => {
    console.error(`Browser page error: ${error.message}`);
  });
});

test("protects the application behind Gather & Graze sign in", async ({
  page
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/auth/);
  await expect(page.getByText("Gather & Graze", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Welcome back" })
  ).toBeVisible();
  await expect(
    page.locator("form").getByRole("button", { name: "Sign in" })
  ).toBeVisible();
});

test("shows account creation and password recovery on mobile", async ({
  page
}) => {
  await page.goto("/auth");
  await page.getByRole("button", { name: "New account" }).click();
  await expect(
    page.getByRole("heading", { name: "Create your account" })
  ).toBeVisible();
  await expect(page.getByLabel("Your name")).toBeVisible();
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(
    page.getByRole("heading", { name: "Reset your password" })
  ).toBeVisible();
});
