import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://localhost:5163' },
  },
  build: {
    outDir: '../api/wwwroot',
    emptyOutDir: true,
  },
});
