import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useStore } from './app/store';
/*
 * The Broadsheet type: Source Serif 4 (Latin, with its true italic) over Noto Serif SC. Bundled,
 * never fetched — the app makes no network request. The CJK face is split by unicode-range, so
 * WebView2 loads only the subsets a document actually uses.
 */
import '@fontsource/source-serif-4/latin-400.css';
import '@fontsource/source-serif-4/latin-400-italic.css';
import '@fontsource/source-serif-4/latin-600.css';
import '@fontsource/noto-serif-sc/400.css';
import '@fontsource/noto-serif-sc/600.css';
import './styles/tokens.css';
import './styles/app.css';
import './styles/document.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

/*
 * Test seam.
 *
 * The automated suites must open a document without a native file dialog (Playwright
 * cannot drive one, and WebDriver cannot either). The handle is installed only when a
 * harness has already signalled itself by setting `__OPENMARK_TEST_FILES__`, which the
 * browser build never sees otherwise — so a shipped build carries no automation surface.
 *
 * The shape is declared ambiently in `src/types/automation.d.ts`, which tsconfig picks up
 * for both the app and the e2e suite. It is not imported: declaration files are not runtime
 * modules and bundlers cannot resolve them.
 */
if (globalThis.window?.__OPENMARK_TEST_FILES__) {
  window.__openmark__ = {
    openPath: (path) => useStore.getState().openPath(path),
    getSource: () => useStore.getState().doc.source,
    getEncoding: () => {
      const { bom, eol } = useStore.getState().doc.encoding;
      return { bom, eol };
    },
  };
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
