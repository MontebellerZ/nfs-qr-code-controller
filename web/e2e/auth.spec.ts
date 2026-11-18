import { test, expect } from '@playwright/test';
import { emailFor, registerPage } from './helpers';

test('cadastro, sessao persistente, saida e validacao de login', async ({ page }) => {
  const password = 'Abc12345';
  await registerPage(page, 'auth', password);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Minhas notas' })).toBeVisible();
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bom ter você de volta' })).toBeVisible();
  expect((await page.request.get('/api/invoices')).status()).toBe(401);
  await page.getByLabel('E-mail', { exact: true }).fill(emailFor('auth'));
  await page.getByLabel('Senha', { exact: true }).fill('WrongPassword123');
  await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
  await expect(page.getByRole('alert')).toContainText('incorretos');
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
  await expect(page.getByRole('heading', { name: 'Minhas notas' })).toBeVisible();
});
