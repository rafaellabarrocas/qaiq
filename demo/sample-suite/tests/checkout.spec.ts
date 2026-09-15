import { test, expect } from '@playwright/test';

let cartId;

test('adds an item to the cart', async ({ page }) => {
  await page.goto('/shop');
  await page.locator('.product-card > button.add').click();
  await page.waitForTimeout(2000);
  await expect(page.locator('#cart-count')).toHaveText('1');
});

test('applies a discount code', async ({ page }) => {
  await page.goto('/cart');
  await page.getByLabel('Email').fill('shopper@example.com');
  await page.locator('li:nth-child(3) input').fill('SAVE20');
  await page.waitForLoadState('networkidle');
  expect(page.getByRole('status')).toHaveText('20% off applied');
});

test('reaches the payment step', async ({ page }) => {
  await page.goto('/checkout');
  await page.locator('.btn-primary').click();
});
