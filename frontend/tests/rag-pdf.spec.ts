import { test, expect } from "@playwright/test";

test.describe("RAG PDF Chat UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("shows initial UI", async ({ page }) => {
    await expect(page.getByText("RAG PDF Chat")).toBeVisible();
    await expect(page.getByText("Upload a PDF to begin")).toBeVisible();
    await expect(page.getByText("No PDF selected")).toBeVisible();
    await expect(page.getByTestId("upload-button")).toBeDisabled();
    await expect(page.getByTestId("question-input")).toBeDisabled();
  });

  test("selects a PDF file", async ({ page }) => {
    await page
      .getByTestId("pdf-input")
      .setInputFiles("tests/fixtures/sample.pdf");

    await expect(page.getByText("sample.pdf")).toBeVisible();

    await expect(page.locator("aside").getByText("Selected")).toBeVisible();
  });

  test("upload button becomes enabled after selecting a PDF", async ({
    page,
  }) => {
    await page
      .getByTestId("pdf-input")
      .setInputFiles("tests/fixtures/sample.pdf");

    await expect(page.getByTestId("upload-button")).toBeEnabled();
  });

  test("clear button becomes enabled after selecting a PDF", async ({
    page,
  }) => {
    await page
      .getByTestId("pdf-input")
      .setInputFiles("tests/fixtures/sample.pdf");

    await expect(page.getByRole("button", { name: /clear/i })).toBeEnabled();
  });

  test("shows selected file name", async ({ page }) => {
    await page
      .getByTestId("pdf-input")
      .setInputFiles("tests/fixtures/sample.pdf");

    await expect(page.getByText("sample.pdf")).toBeVisible();
  });

  test("status changes to Selected after choosing a PDF", async ({ page }) => {
    await page
      .getByTestId("pdf-input")
      .setInputFiles("tests/fixtures/sample.pdf");

    await expect(page.locator("aside").getByText("Selected")).toBeVisible();
  });

  test("question textarea remains disabled until upload", async ({ page }) => {
    await page
      .getByTestId("pdf-input")
      .setInputFiles("tests/fixtures/sample.pdf");

    await expect(page.getByTestId("question-input")).toBeDisabled();
  });

  test("ask button remains disabled before upload", async ({ page }) => {
    await page
      .getByTestId("pdf-input")
      .setInputFiles("tests/fixtures/sample.pdf");

    await expect(page.getByTestId("ask-button")).toBeDisabled();
  });

  test("renders sidebar statistics", async ({ page }) => {
    await expect(page.getByText("Available questions")).toBeVisible();
    await expect(page.getByText("Questions used")).toBeVisible();
    await expect(page.getByText("Max questions")).toBeVisible();
    await expect(page.getByText("Max file size")).toBeVisible();
  });

  test("renders session information", async ({ page }) => {
    await expect(page.getByText("Pages")).toBeVisible();
    await expect(page.getByText("Chunks")).toBeVisible();
    await expect(page.getByText("Session expires")).toBeVisible();
  });
});
