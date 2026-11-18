import { test, expect } from '@playwright/test';
import { csrf, registerApi, xmlFor } from './helpers';

test('SQL Server isola usuarios e impede duplicata concorrente', async ({ browser }) => {
  const alice = await browser.newContext({ baseURL: 'http://localhost:5163' });
  const bob = await browser.newContext({ baseURL: 'http://localhost:5163' });
  try {
    expect((await alice.request.get('/api/invoices')).status()).toBe(401);
    await registerApi(alice.request, 'alice');
    await registerApi(bob.request, 'bob');
    const options = {
      headers: await csrf(alice.request),
      multipart: { file: { name: 'nota.xml', mimeType: 'application/xml', buffer: Buffer.from(xmlFor()) } },
    };
    const uploads = await Promise.all([
      alice.request.post('/api/invoices', options),
      alice.request.post('/api/invoices', options),
    ]);
    expect(uploads.map(response => response.status()).sort()).toEqual([201, 409]);
    const invoices = await (await alice.request.get('/api/invoices')).json();
    expect(invoices).toHaveLength(1);
    expect(await (await bob.request.get('/api/invoices')).json()).toEqual([]);
    expect((await bob.request.post(`/api/invoices/${invoices[0].id}/complete`,
      { headers: await csrf(bob.request) })).status()).toBe(404);
    expect((await alice.request.post(`/api/invoices/${invoices[0].id}/complete`)).status()).toBe(400);
    const confirmOptions = { headers: await csrf(alice.request) };
    const confirmations = await Promise.all([
      alice.request.post(`/api/invoices/${invoices[0].id}/complete`, confirmOptions),
      alice.request.post(`/api/invoices/${invoices[0].id}/complete`, confirmOptions),
    ]);
    expect(confirmations.every(response => response.status() === 200)).toBe(true);
    const completed = await (await alice.request.get('/api/invoices')).json();
    expect(completed[0].completedAt).not.toBeNull();
    expect((await confirmations[0].json()).completedAt).toBe((await confirmations[1].json()).completedAt);
    const shared = await bob.request.post('/api/invoices', {
      ...options, headers: await csrf(bob.request),
    });
    expect(shared.status()).toBe(201);
    expect((await shared.json()).completedAt).toBeNull();
  } finally {
    await alice.close();
    await bob.close();
  }
});
