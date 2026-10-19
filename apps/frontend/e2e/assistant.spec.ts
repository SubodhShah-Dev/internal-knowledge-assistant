import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'employee-handbook.txt');

test('signup, upload handbook, ask with groundedness audit, download, and abstain', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = 'E2ePassword123!';

  // --- Sign up ---
  await page.goto('/');
  await page.getByRole('button', { name: /switch to sign up/i }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /^sign up$/i }).click();
  await expect(page.getByText(email)).toBeVisible();

  // --- Upload the handbook ---
  await page.getByLabel('Document (PDF or TXT, max 10 MB)').setInputFiles(FIXTURE);
  await page.getByRole('button', { name: /^upload$/i }).click();
  await expect(page.getByText(/upload complete/i)).toBeVisible({ timeout: 30_000 });

  // --- Document library lists it, with a working download ---
  const row = page.locator('.document-item', { hasText: 'employee-handbook' });
  await expect(row).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await row.getByRole('button', { name: /download/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('employee-handbook.txt');

  // --- Ask a question the handbook answers ---
  await page.getByLabel(/ask a question/i).fill('How many days of annual leave do employees get?');
  await page.getByRole('button', { name: /^ask$/i }).click();

  await expect(page.getByTestId('answer')).toContainText('20 days', { timeout: 60_000 });
  await expect(page.getByTestId('sources')).toBeVisible();
  await expect(page.getByTestId('sources')).toContainText('Annual Leave Policy');

  // --- Groundedness Audit panel is present with a score ---
  await expect(page.getByTestId('verification')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('verification')).toContainText('Groundedness Audit');

  // --- A question with zero lexical overlap gets a hard abstention ---
  await page.getByLabel(/ask a question/i).fill('What is the quarterly rocket launch budget for the Mars colony?');
  await page.getByRole('button', { name: /^ask$/i }).click();
  await expect(page.getByTestId('answer')).toContainText(/could not find|couldn't find/i, { timeout: 60_000 });
  await expect(page.getByTestId('sources')).toHaveCount(0);
  await expect(page.getByTestId('verification')).toHaveCount(0);

  // --- Logout returns to the login form ---
  await page.getByRole('button', { name: /log out/i }).click();
  await expect(page.getByRole('button', { name: /log in/i })).toBeVisible();
});
