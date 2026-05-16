import fs from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { E2E_PASSWORD, E2E_STATE_PATH, type E2EState } from './state';

let state: E2EState;

test.beforeAll(async () => {
  const raw = await fs.readFile(E2E_STATE_PATH, 'utf8');
  state = JSON.parse(raw) as E2EState;
});

async function login(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('owner lands on cockpit and sees owner navigation', async ({ page }) => {
  await login(page, state.users.owner);
  await expect(page).toHaveURL(/\/cockpit$/);
  await expect(page.getByRole('heading', { name: 'Owner Cockpit' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Owner Cockpit' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Super Admin' })).toHaveCount(0);

   const goalTitle = `Revenue Goal ${state.runId}`;
   const kraName = `Pipeline KRA ${state.runId}`;

   await page.getByRole('link', { name: 'Add Goal' }).click();
   await expect(page).toHaveURL(/\/goals\?create=goal$/);
   await page.getByLabel('Title').fill(goalTitle);
   await page.getByLabel('Description').fill('Owner can create goals from the cockpit flow.');
   await page.getByLabel('Period').fill('Q3 FY2026');
   await page.getByLabel('Target').fill('100');
   await page.getByLabel('Unit').fill('%');
   await page.getByRole('button', { name: 'Create Goal' }).click();
   await expect(page.getByText(goalTitle)).toBeVisible();

   await page.getByRole('button', { name: 'Add KRA' }).click();
   await page.getByLabel('Name').fill(kraName);
   await page.getByLabel('Description').fill('Owner can create KRAs from the goals workspace.');
   await page.getByRole('combobox').nth(0).click();
   await page.getByRole('option', { name: state.departmentName }).click();
   await page.getByLabel('Target').fill('25');
   await page.getByLabel('Unit').fill('%');
   await page.getByLabel('Period').fill('Q3 FY2026');
   await page.getByRole('button', { name: 'Create KRA' }).click();
   await expect(page.getByText(kraName)).toBeVisible();
});

test('company admin lands on dashboard and sees admin navigation', async ({ page }) => {
  await login(page, state.users.companyAdmin);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Good');
  await expect(page.getByRole('link', { name: 'Departments' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Owner Cockpit' })).toHaveCount(0);
});

test('department head lands on scoped dashboard and sees department tools', async ({ page }) => {
  await login(page, state.users.departmentHead);
  await expect(page).toHaveURL(new RegExp(`/dashboard/${state.departmentSlug}$`));
  await expect(page.getByRole('heading', { name: /Dashboard$/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Goals & KRAs' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Hiring' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Departments' })).toHaveCount(0);
});

test('manager lands on tasks and sees only manager-appropriate navigation', async ({ page }) => {
  await login(page, state.users.manager);
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Team' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Goals & KRAs' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0);
});

test('team member lands on tasks with limited navigation', async ({ page }) => {
  await login(page, state.users.teamMember);
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Standup' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Team' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Reviews' })).toHaveCount(0);
});

test('coach advisor falls back to dashboard without restricted admin links', async ({ page }) => {
  await login(page, state.users.coach);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Good');
  await expect(page.getByRole('link', { name: 'Tasks' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Super Admin' })).toHaveCount(0);
});

test('super admin can navigate to super admin console', async ({ page }) => {
  await login(page, state.users.superAdmin);
  await expect(page).toHaveURL(/\/cockpit$/);
  await page.getByRole('link', { name: 'Super Admin' }).click();
  await expect(page).toHaveURL(/\/superadmin$/);
  await expect(page.getByRole('heading', { name: 'Super Admin' })).toBeVisible();
});
