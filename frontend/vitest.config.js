// Vitest configuration — kept separate from vite.config.js so the production
// build config stays untouched. Test-only tooling (Vitest + Testing Library).
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: false,
    // userEvent typing across six form fields can exceed the 5s default when
    // files run in parallel on slower machines (seen as flaky timeouts).
    testTimeout: 15000,
  },
});
