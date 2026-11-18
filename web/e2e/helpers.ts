import { expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

export const password = 'BrowserTestPassword123';
export const emailFor = (name: string) => `${process.env.NFS_E2E_PREFIX}${name}@example.test`;

export function keyFor(number = '000000123'): string {
  const prefix = `3526111234567800019555001${number}112345678`;
  const sum = Array.from(prefix).reverse().reduce((total, digit, index) =>
    total + Number(digit) * (2 + index % 8), 0);
  return prefix + (sum % 11 < 2 ? 0 : 11 - sum % 11);
}

export const xmlFor = (key = keyFor()) =>
  `<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe${key}" versao="4.00"/></NFe>`;

export async function csrf(request: APIRequestContext) {
  const response = await request.get('/api/auth/csrf');
  expect(response.ok()).toBeTruthy();
  const body: { token: string } = await response.json();
  return { 'X-CSRF-TOKEN': body.token };
}

export async function registerApi(request: APIRequestContext, name: string) {
  const response = await request.post('/api/auth/register', {
    headers: await csrf(request),
    data: { email: emailFor(name), password },
  });
  expect(response.status(), await response.text()).toBe(200);
}

export async function registerPage(page: Page, name: string, accountPassword = password) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await page.getByLabel('E-mail', { exact: true }).fill(emailFor(name));
  await page.getByLabel('Senha', { exact: true }).fill(accountPassword);
  await page.getByRole('button', { name: 'Criar minha conta' }).click();
  await expect(page.getByRole('heading', { name: 'Minhas notas' })).toBeVisible();
}
