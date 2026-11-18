import { test, expect } from '@playwright/test';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { keyFor, registerPage, xmlFor } from './helpers';

test('upload, QR decodificavel, copia e confirmacao manual no celular', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 390, height: 844 });
  await registerPage(page, 'workflow');
  const firstKey = keyFor();
  const secondKey = keyFor('000000456');
  await page.getByLabel('Arquivos de notas fiscais').setInputFiles([
    { name: 'primeira.xml', mimeType: 'application/xml', buffer: Buffer.from(xmlFor(firstKey)) },
    { name: 'segunda.xml', mimeType: 'application/xml', buffer: Buffer.from(xmlFor(secondKey)) },
    { name: 'servico.xml', mimeType: 'application/xml', buffer: Buffer.from('<NFSe/>') },
  ]);
  await expect(page.getByLabel('Resultado dos envios')).toContainText('NFS-e');
  await expect(page.getByRole('button', { name: 'Selecionar arquivos' })).toBeEnabled();
  await expect(page.locator('.invoice-row')).toHaveCount(2);
  await page.getByLabel('Selecionar pendentes visíveis').check();
  await page.getByRole('button', { name: 'Escanear selecionadas (2)' }).click();
  const key = await page.getByLabel('Chave de acesso', { exact: true }).inputValue();
  expect([firstKey, secondKey]).toContain(key);
  const screenshot = await page.getByRole('img', { name: 'QR Code com a chave de acesso da nota' }).screenshot();
  const image = PNG.sync.read(screenshot);
  expect(jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data).toBe(key);
  await page.getByRole('button', { name: 'Copiar chave de acesso' }).click();
  await expect(page.getByRole('status')).toContainText('Chave copiada');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(key);
  const before = await (await page.request.get('/api/invoices')).json();
  expect(before.every((invoice: { completedAt: string | null }) => invoice.completedAt === null)).toBe(true);
  await page.getByRole('button', { name: 'Confirmar escaneamento' }).click();
  await expect(page.getByLabel('Chave de acesso', { exact: true })).not.toHaveValue(key);
  await page.getByRole('button', { name: 'Fechar QR Code' }).click();
  await expect(page.locator('.invoice-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Concluídas 1' }).click();
  await expect(page.locator('.invoice-row')).toHaveCount(1);
  await expect(page.locator('.invoice-row')).toContainText('Concluída em');
  await page.reload();
  await page.getByRole('button', { name: 'Concluídas 1' }).click();
  await expect(page.locator('.invoice-row')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
