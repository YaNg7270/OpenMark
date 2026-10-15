/**
 * Automation surface shared by the app and the end-to-end suites.
 *
 * Declared in `src` rather than in the test tree so both sides see one definition and a
 * change to the handle cannot desynchronise the app from the tests. The handle is only
 * installed at runtime when a harness has set `__OPENMARK_TEST_FILES__`.
 */
export {};

declare global {
  interface Window {
    /** Fixture documents for the browser backend of the file service, keyed by path. */
    __OPENMARK_TEST_FILES__?: Record<string, string>;
    /** Installed by `src/main.tsx` when a harness is present. */
    __openmark__?: {
      openPath(path: string): Promise<void>;
      /**
       * The authoritative document text.
       *
       * Exists because no DOM element can be trusted to report it: a textarea normalises
       * line endings, so reading the source through the UI would hide exactly the class of
       * corruption the round-trip tests are meant to catch.
       */
      getSource(): string;
      /** `{ bom, eol }` as detected when the file was read. */
      getEncoding(): { bom: boolean; eol: 'lf' | 'crlf' | 'cr' };
    };
    /** Sentinel the hostile-HTML spec asserts was never set by injected script. */
    __pwned?: boolean;
  }
}
