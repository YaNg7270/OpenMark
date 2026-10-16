import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const host = process.env.TAURI_DEV_HOST;

/**
 * Drops the `.woff` fallback from @fontsource stylesheets.
 *
 * Each `@font-face` lists woff2 and then woff; Vite emits every `url()` it sees, so the bundle
 * would carry both — roughly doubling the ~9 MB Noto Serif SC subset set. WebView2 reads woff2,
 * so the fallback is dead weight in the installer.
 */
function woff2Only(): Plugin {
  return {
    name: 'openmark:woff2-only',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('@fontsource') || !id.endsWith('.css')) return null;
      return code.replace(/,\s*url\([^)]*\.woff\)\s*format\('woff'\)/g, '');
    },
  };
}

/**
 * Tauri needs a fixed dev port and must not fight the Rust watcher.
 * `build.target` is pinned to the WebView2 baseline (Chromium 130+ ships on
 * Windows 11; the dev machine has 149) so we can rely on modern platform APIs
 * without shipping polyfills.
 */
export default defineConfig({
  plugins: [woff2Only(), react()],

  resolve: {
    alias: {
      // Resolved through `import.meta.url` rather than a CommonJS global: Vite 8's native
      // config loader does not provide `__dirname`.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  // Tauri prints its own build output; swallowing it hides Rust errors.
  clearScreen: false,

  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: {
      // Rust sources and vendored MathJax are not Vite's business.
      ignored: ['**/src-tauri/**', '**/public/mathjax/**', '**/.tools/**'],
    },
  },

  envPrefix: ['VITE_', 'TAURI_ENV_*'],

  build: {
    target: 'chrome130',
    // Source maps only for debug builds; they triple the artifact size.
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    minify: process.env.TAURI_ENV_DEBUG ? false : 'esbuild',
    // Mermaid and Shiki grammars are reached exclusively through dynamic `import()`,
    // so the bundler already splits them out; no manual chunk map is needed (and Vite 8's
    // Rolldown backend no longer accepts the object form of `manualChunks`).
    chunkSizeWarningLimit: 2000,
  },

  optimizeDeps: {
    // Shiki and Mermaid pull in dozens of ESM submodules; pre-bundling them is
    // far faster on cold dev-server start.
    include: ['react', 'react-dom', 'markdown-it', 'dompurify'],
  },
});
