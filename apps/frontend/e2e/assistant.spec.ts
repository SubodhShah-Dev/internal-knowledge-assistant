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

  // --- Upload the handbook via the documents page ---
  await page.getByRole('button', { name: /^documents$/i }).click();
  await expect(page).toHaveURL(/\/documents$/);
  await page.getByLabel('Document (PDF or TXT, max 10 MB)').setInputFiles(FIXTURE);
  await page.getByRole('button', { name: /^upload$/i }).click();
  await expect(page.getByText(/upload complete/i)).toBeVisible({ timeout: 30_000 });

  // --- Document listed on the page, with a working download ---
  const row = page.locator('.document-item', { hasText: 'employee-handbook' });
  await expect(row).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await row.getByRole('button', { name: /download/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('employee-handbook.txt');

  // --- Back to chat; ask a question the handbook answers (SSE streaming) ---
  await page.getByRole('button', { name: /new chat/i }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByLabel(/ask a question/i).fill('How many days of annual leave do employees get?');
  await page.getByRole('button', { name: /send message/i }).click();
  await expect(page.getByTestId('answer')).toContainText('20 days', { timeout: 60_000 });
  await expect(page).toHaveURL(/\/c\/\d+/);

  // --- Provider model limits (reported by the provider, never enforced) ---
  const limitsRow = page.locator('.usage-row');
  await expect(limitsRow).toBeVisible({ timeout: 20_000 });
  await expect(limitsRow.locator('.usage-model')).toContainText(/gpt-oss/i, { timeout: 20_000 });
  await expect(limitsRow.locator('.usage-sub')).toContainText(/reported by/i);
  await expect(limitsRow.locator('.usage-label', { hasText: 'Requests' })).toBeVisible();
  await expect(limitsRow.locator('.usage-label', { hasText: 'Tokens' })).toBeVisible();
  await expect(limitsRow.locator('.usage-counts').first()).toContainText(/\d[\d,.]*k? of [\d,.]+k? left/);
  await expect(limitsRow.locator('.usage-percent').first()).toHaveText(/^\d+%$/);
  await expect(limitsRow.getByRole('meter', { name: 'Requests remaining' })).toBeVisible();
  await expect(limitsRow.getByRole('meter', { name: 'Tokens remaining' })).toBeVisible();

  // --- Sources (collapsed details section) ---
  await page.locator('.msg-section summary').filter({ hasText: /^sources/i }).click();
  await expect(page.getByTestId('sources')).toBeVisible();
  await expect(page.getByTestId('sources')).toContainText('employee-handbook');

  // --- Groundedness Audit: collapsed by default, expands on click ---
  const auditSummary = page
    .locator('.msg-section summary')
    .filter({ hasText: /groundedness audit/i });
  await expect(auditSummary).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('verification')).toBeHidden();
  await auditSummary.click();
  await expect(page.getByTestId('verification')).toBeVisible();
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

  // Upload a fixture document so the abstention path has documents attached.
  await page.getByRole('button', { name: /^documents$/i }).click();
  await expect(page).toHaveURL(/\/documents$/);
  await page.getByLabel('Document (PDF or TXT, max 10 MB)').setInputFiles(FIXTURE);
  await page.getByRole('button', { name: /^upload$/i }).click();
  await expect(page.getByText(/upload complete/i)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /new chat/i }).click();
  await expect(page).toHaveURL(/\/$/);

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

  // The sidebar's own button expands it again (desktop hides the header hamburger).
  await page.getByRole('button', { name: /expand sidebar/i }).click();
  await expect(sidebar.locator('.brand-name')).toBeVisible();
  await expect(sidebar).toHaveCSS('width', '272px');

  // Rail state persists across reload.
  await page.getByRole('button', { name: /collapse sidebar/i }).click();
  await expect(sidebar).toHaveCSS('width', '60px');
  await page.reload();
  await expect(sidebar).toHaveCSS('width', '60px', { timeout: 20_000 });
  await expect(sidebar.locator('.brand-name')).toBeHidden();
});

test('documents page: search, view contents, delete', async ({ page }) => {
  await signUp(page);

  // Upload via the documents page.
  await page.getByRole('button', { name: /^documents$/i }).click();
  await expect(page).toHaveURL(/\/documents$/);
  await page.getByLabel('Document (PDF or TXT, max 10 MB)').setInputFiles(FIXTURE);
  await page.getByRole('button', { name: /^upload$/i }).click();
  await expect(page.getByText(/upload complete/i)).toBeVisible({ timeout: 30_000 });
  const row = page.locator('.document-item', { hasText: 'employee-handbook' });
  await expect(row).toContainText(/chunk/i);

  // Title search: no-match state, then exactly one match.
  const search = page.getByLabel(/search documents/i);
  await search.fill('budget');
  await expect(page.getByText(/no documents match/i)).toBeVisible({ timeout: 10_000 });
  await search.fill('handbook');
  await expect(page.locator('.document-item')).toHaveCount(1, { timeout: 10_000 });

  // Content search surfaces a highlighted excerpt from inside the file.
  await search.fill('stipend');
  const matchRow = page.locator('.document-item', { hasText: 'employee-handbook' });
  await expect(matchRow).toBeVisible({ timeout: 10_000 });
  await expect(matchRow.locator('.doc-match')).toContainText('stipend');

  // View contents: chunk accordion reveals the handbook text.
  await matchRow.getByRole('button', { name: /view employee-handbook/i }).click();
  const chunk = page.locator('.doc-chunk').first();
  await expect(chunk).toBeVisible();
  await chunk.locator('summary').click();
  await expect(chunk).toContainText('Acme Corp Employee Handbook');

  // Delete with confirmation returns the page to its empty state.
  page.once('dialog', confirmDialog => confirmDialog.accept());
  await matchRow.getByRole('button', { name: /delete employee-handbook/i }).click();
  await search.fill('');
  await expect(page.getByText(/no documents yet/i)).toBeVisible({ timeout: 10_000 });
});

test('attach modal: search, view contents, and manage session attachment', async ({ page }) => {
  await signUp(page);

  // Put one document in the library through the documents page.
  await page.getByRole('button', { name: /^documents$/i }).click();
  await expect(page).toHaveURL(/\/documents$/);
  await page.getByLabel('Document (PDF or TXT, max 10 MB)').setInputFiles(FIXTURE);
  await page.getByRole('button', { name: /^upload$/i }).click();
  await expect(page.getByText(/upload complete/i)).toBeVisible({ timeout: 30_000 });

  // Open the attach modal from the composer.
  await page.getByRole('button', { name: /new chat/i }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('button', { name: /upload a document/i }).click();
  const dialog = page.getByRole('dialog', { name: 'Documents' });
  await expect(dialog).toBeVisible();

  // A new chat attaches the library by default.
  const row = dialog.locator('.document-item', { hasText: 'employee-handbook' });
  await expect(row).toBeVisible();
  await expect(row.locator('.badge-attached')).toBeVisible();

  // Search inside the modal by content, with a highlighted excerpt.
  await dialog.getByLabel(/search documents/i).fill('stipend');
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row.locator('.doc-match')).toContainText('stipend');

  // View the indexed contents inside the modal.
  await row.getByRole('button', { name: /view employee-handbook/i }).click();
  const chunk = dialog.locator('.doc-chunk').first();
  await expect(chunk).toBeVisible();
  await chunk.locator('summary').click();
  await expect(chunk).toContainText('Acme Corp Employee Handbook');

  // Detach from the session, then attach again.
  await row.getByRole('button', { name: /detach employee-handbook/i }).click();
  await expect(row.locator('.badge-attached')).toHaveCount(0);
  await row.getByRole('button', { name: /attach employee-handbook/i }).click();
  await expect(row.locator('.badge-attached')).toBeVisible();

  await dialog.getByRole('button', { name: /close documents/i }).click();
  await expect(dialog).toBeHidden();
});

test('follow-up question remembers the earlier turn in the same conversation', async ({
  page
}) => {
  // Two real LLM round-trips plus verifier calls; the default 90s is too tight.
  test.setTimeout(240_000);
  await signUp(page);

  // Upload via the documents page, then start a chat.
  await page.getByRole('button', { name: /^documents$/i }).click();
  await expect(page).toHaveURL(/\/documents$/);
  await page.getByLabel('Document (PDF or TXT, max 10 MB)').setInputFiles(FIXTURE);
  await page.getByRole('button', { name: /^upload$/i }).click();
  await expect(page.getByText(/upload complete/i)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /new chat/i }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.getByLabel(/ask a question/i).fill('How many days of annual leave do employees get?');
  await page.getByRole('button', { name: /send message/i }).click();
  await expect(page.getByTestId('answer')).toContainText('20 days', { timeout: 90_000 });
  // Navigation to /c/:id happens when the stream completes.
  await expect(page).toHaveURL(/\/c\/\d+/, { timeout: 90_000 });
  const conversationUrl = page.url();

  // Follow-up that leans on the earlier turn's context.
  await page
    .getByLabel(/ask a question/i)
    .fill('Can those days be carried over into the next year?');
  await page.getByRole('button', { name: /send message/i }).click();
  const answers = page.getByTestId('answer');
  await expect(answers.nth(1)).toContainText(/\S/, { timeout: 120_000 });
  // Stream finished: the blinking-cursor class is dropped when done arrives.
  // (The send button stays disabled on an empty composer, so it is not a signal.)
  await expect(answers.nth(1)).not.toHaveClass(/cursor-blink/, { timeout: 120_000 });
  // The canned first-turn abstention must never answer a follow-up.
  await expect(answers.nth(1)).not.toContainText(/try another wording/i);

  // Same conversation; both turns persisted across a reload.
  await expect(page).toHaveURL(conversationUrl);
  await expect(page.locator('.session-item')).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId('answer')).toHaveCount(2, { timeout: 20_000 });
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
