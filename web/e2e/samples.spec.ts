import { test, expect } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { csrf, registerApi } from './helpers';

test('extrai o acervo local de PDFs e XMLs sem persistir os originais', async ({ request }) => {
  const directory = process.env.NFS_SAMPLE_DIRECTORY;
  test.skip(!directory, 'Defina NFS_SAMPLE_DIRECTORY para validar os documentos privados locais.');
  test.setTimeout(180_000);
  await registerApi(request, 'samples');
  const files = (await readdir(directory!)).filter(file => /\.(xml|pdf)$/i.test(file));
  expect(files.length).toBeGreaterThan(0);
  let accepted = 0;
  let duplicates = 0;
  let unsupported = 0;
  for (const file of files) {
    const buffer = await readFile(join(directory!, file));
    const response = await request.post('/api/invoices', {
      headers: await csrf(request),
      multipart: { file: { name: file, mimeType: extname(file) === '.pdf' ? 'application/pdf' : 'application/xml', buffer } },
    });
    if (/nfse\.pdf$/i.test(file)) {
      expect(response.status()).toBe(400);
      expect((await response.json()).detail).toContain('NFS-e');
      unsupported++;
      continue;
    }
    expect([201, 409]).toContain(response.status());
    if (response.status() === 409) {
      duplicates++;
      continue;
    }
    const invoice = await response.json();
    expect(invoice.accessKey).toMatch(/^[0-9]{44}$/);
    const expected = extname(file) === '.xml'
      ? buffer.toString('utf8').match(/\bId=["']NFe([0-9]{44})["']/)?.[1]
      : file.match(/(?<![0-9])[0-9]{44}(?![0-9])/)?.[0];
    if (expected) expect(invoice.accessKey).toBe(expected);
    accepted++;
  }
  const saved = await (await request.get('/api/invoices')).json();
  expect(saved).toHaveLength(accepted);
  console.log(`Acervo: ${files.length} arquivos, ${accepted} cadastrados, ${duplicates} duplicados, ${unsupported} NFS-e rejeitadas.`);
});
