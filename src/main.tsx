import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useStore } from './app/store';
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
  };
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
