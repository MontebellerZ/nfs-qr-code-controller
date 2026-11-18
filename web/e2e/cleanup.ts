import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export default function cleanup() {
  const prefix = process.env.NFS_E2E_PREFIX;
  if (!prefix) throw new Error('Prefixo de limpeza E2E ausente.');
  const script = fileURLToPath(new URL('./cleanup.ps1', import.meta.url));
  execFileSync('powershell.exe', ['-NoProfile', '-File', script, '-Prefix', prefix], {
    stdio: 'inherit',
  });
}
