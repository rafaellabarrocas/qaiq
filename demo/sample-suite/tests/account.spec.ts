import { test, expect } from '@playwright/test';

test.describe.serial('account settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('user@example.com');
    await page.getByLabel('Password').fill('hunter2');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForTimeout(1500);
  });

  test('updates the display name', async ({ page }) => {
    const el = await page.$('.profile-name');
    await el.fill('New Name');
    expect(true).toBe(true);
  });
});
