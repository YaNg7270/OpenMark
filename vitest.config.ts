import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Vitest configuration.
 *
 * Two projects, split by what they can honestly assert:
 *
 *  - **unit** runs in Node. It covers the parser, the math tokenizer, diagnostics, file
 *    encoding and every round-trip property. These are the tests that must be fast and
 *    deterministic, and none of them need a DOM.
 *  - **dom** runs in jsdom, only because DOMPurify needs a document. It exists to pin the
 *    sanitiser's behaviour, which is a security boundary and therefore tested directly
 *    rather than only through the browser suite.
 *
 * MathJax is deliberately absent from both. MathJax 4's Node component loader hands bare
 * Windows paths (`D:/…`) to `import()`, which requires a `file://` URL, so it cannot boot
 * under Node on this platform at all. Real typesetting is therefore verified in the
 * Playwright suite against the shipping browser path — which is the stronger test anyway.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        resolve: {
          alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
        },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
          exclude: ['tests/unit/dom/**'],
          globals: false,
          testTimeout: 30_000,
        },
      },
      {
        resolve: {
          alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
        },
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['tests/unit/dom/**/*.test.ts'],
          globals: false,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['src/core/**/*.ts', 'src/app/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/types/**'],
    },
  },
});
