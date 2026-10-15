/**
 * The one bridge from the export subsystem into the desktop shell.
 *
 * The invoke function is read off `window.__TAURI_INTERNALS__` rather than imported from
 * `@tauri-apps/api`: the export layer must keep working in a plain browser (where it
 * degrades to a download, and reports remote images instead of inlining local ones), the
 * lookup must not throw at module scope, and `@tauri-apps/api`'s own `invoke` rejects before
 * the shell exists instead of returning `null`.
 *
 * The ambient `Window.__TAURI_INTERNALS__` declaration belongs to
 * `src/core/fs/fileService.ts`; this module types itself from that declaration rather than
 * restating it, because a second declaration of the same property would not merge.
 */

/** The desktop invoke signature, indexed off the app's own ambient declaration. */
export type ExportInvoke = NonNullable<Window['__TAURI_INTERNALS__']>['invoke'];

/** The desktop invoke function, or `null` outside the Tauri shell. */
export function exportInvoke(): ExportInvoke | null {
  const internals = globalThis.window?.__TAURI_INTERNALS__;
  if (!internals?.invoke) return null;
  const { invoke } = internals;
  return invoke.bind(internals);
}
