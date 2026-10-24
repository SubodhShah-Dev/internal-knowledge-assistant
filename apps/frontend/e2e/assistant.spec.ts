import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'employee-handbook.txt'
);

async function signUp(page: Page): Promise<{ email: string; password: string }> {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const password = 'E2ePassword123!';

  await page.goto('/');
  await page.getByRole('button', { name: /switch to sign up/i }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /^sign up$/i }).click();
  await expect(page.getByText(email)).toBeVisible();
  return { email, password };
}

test('full loop: upload, ask with audit, reload session, rename, delete, logout', async ({
  page
}) => {
  const { email } = await signUp(page);
  await expect(page.getByText('What should we look into?')).toBeVisible();

  // --- Upload the handbook via the sidebar Documents modal ---
  await page.getByRole('button', { name: /^documents$/i }).click();
  const dialog = page.getByRole('dialog', { name: 'Documents' });
  await expect(dialog).toBeVisible();
  await page.getByLabel('Document (PDF or TXT, max 10 MB)').setInputFiles(FIXTURE);
  await page.getByRole('button', { name: /^upload$/i }).click();
  await expect(dialog.getByText(/upload complete/i)).toBeVisible({ timeout: 30_000 });

  // --- Document listed, with a working download ---
  const row = dialog.locator('.document-item', { hasText: 'employee-handbook' });
  await expect(row).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await row.getByRole('button', { name: /download/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('employee-handbook.txt');
  await dialog.getByRole('button', { name: /close documents/i }).click();
  await expect(dialog).toBeHidden();

  // --- Ask a question the handbook answers (SSE streaming) ---
  await page.getByLabel(/ask a question/i).fill('How many days of annual leave do employees get?');
  await page.getByRole('button', { name: /send message/i }).click();
  await expect(page.getByTestId('answer')).toContainText('20 days', { timeout: 60_000 });
  await expect(page).toHaveURL(/\/c\/\d+/);

  // --- Sources (collapsed details section) ---
  await page.locator('.msg-section summary').filter({ hasText: /^sources/i }).click();
  await expect(page.getByTestId('sources')).toBeVisible();
  await expect(page.getByTestId('sources')).toContainText('employee-handbook');

  // --- Groundedness Audit panel present with a score ---
  await expect(page.getByTestId('verification')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('verification')).toContainText('Groundedness Audit');

  // --- Session persisted to the sidebar ---
  const sessionRow = page.locator('.session-item').first();
  await expect(sessionRow).toContainText('How many days of annual leave');

  // --- Reload restores the thread from the sessions API ---
  await page.reload();
  await expect(page.locator('.message-user').first()).toContainText('annual leave', {
    timeout: 20_000
  });
  await expect(page.getByTestId('answer')).toContainText('20 days', { timeout: 20_000 });
  await expect(page.locator('.session-item')).toHaveCount(1);

  // --- Rename the session inline ---
  await page.getByRole('button', { name: /^rename /i }).first().click();
  const renameInput = page.getByLabel('Rename conversation');
  await renameInput.fill('Leave policy');
  await renameInput.press('Enter');
  await expect(page.locator('.session-item').first()).toContainText('Leave policy');

  // --- Delete the session (confirm dialog) ---
  page.once('dialog', dialog2 => dialog2.accept());
  await page.getByRole('button', { name: /^delete /i }).first().click();
  await expect(page.locator('.session-item')).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);

  // --- Logout returns to the login form ---
  await page.getByRole('button', { name: /log out/i }).click();
  await expect(page.getByRole('button', { name: /^log in$/i })).toBeVisible();
  expect(email).toContain('@example.com');
});

test('abstention: unrelated question with no matching evidence', async ({ page }) => {
  await signUp(page);

  await page.getByLabel(/ask a question/i).fill(
    'What is the quarterly rocket launch budget for the Mars colony?'
  );
  await page.getByRole('button', { name: /send message/i }).click();

  await expect(page.getByTestId('answer')).toContainText(/couldn't find/i, { timeout: 60_000 });
  // No sources, no audit panel for an abstention.
  await expect(page.getByTestId('sources')).toHaveCount(0);
  await expect(page.getByTestId('verification')).toHaveCount(0);
  // Abstention still creates a persisted session.
  await expect(page).toHaveURL(/\/c\/\d+/);
  await expect(page.locator('.session-item')).toHaveCount(1);
});

test('desktop sidebar collapses to an icon rail and persists across reload', async ({ page }) => {
  await signUp(page);
  const sidebar = page.locator('.sidebar');
  await expect(sidebar.locator('.brand-name')).toBeVisible();

  // Collapse via the sidebar's own button: icon-only rail.
  await page.getByRole('button', { name: /collapse sidebar/i }).click();
  await expect(sidebar).toHaveCSS('width', '60px');
  await expect(sidebar.locator('.brand-name')).toBeHidden();
  await expect(sidebar.locator('.session-rail-icon')).toBeHidden();

  // Header hamburger expands it again.
  await page.getByRole('button', { name: /toggle sidebar/i }).click();
  await expect(sidebar.locator('.brand-name')).toBeVisible();
  await expect(sidebar).toHaveCSS('width', '272px');

  // Rail state persists across reload.
  await page.getByRole('button', { name: /collapse sidebar/i }).click();
  await expect(sidebar).toHaveCSS('width', '60px');
  await page.reload();
  await expect(sidebar).toHaveCSS('width', '60px', { timeout: 20_000 });
  await expect(sidebar.locator('.brand-name')).toBeHidden();
});

test.describe('mobile layout', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('drawer opens and closes at 390x844', async ({ page }) => {
    await signUp(page);

    const toggle = page.getByRole('button', { name: /toggle sidebar/i });
    await expect(toggle).toBeVisible();

    await toggle.click();
    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toHaveClass(/open/);
    await expect(sidebar).toHaveCSS('width', '272px');
    await expect(page.getByRole('button', { name: /new chat/i })).toBeVisible();

    await page.getByRole('button', { name: /close sidebar/i }).first().click();
    await expect(sidebar).not.toHaveClass(/open/);
  });
});
