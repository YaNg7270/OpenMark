import { useState } from 'react';
import { useStore, isDirty, type DocumentState } from '@/app/store';
import { t } from '@/i18n';
import { ConfirmDialog } from './ConfirmDialog';
import { LockSimple, X } from './icons';

/**
 * Document tabs, set as a row of names under the masthead.
 *
 * A tab's displayed state comes from whichever document holds it — the active one lives in
 * `doc` and the rest in `parkedTabs`. The bar therefore reads both, and a dirty marker is
 * computed from the parked document rather than remembered, so it cannot go stale.
 *
 * Shown even with one document open: the active tab is where the window names the document,
 * and where its read-only lock and unsaved dot sit.
 *
 * A navigation list with `aria-current`, not an ARIA tablist: each tab carries its own close
 * button, and a tablist may own nothing but tabs.
 */

interface TabBarProps {
  /** Called when a tab is closed, after the store has been updated. */
  onAfterClose?: () => void;
}

export function TabBar({ onAfterClose }: TabBarProps) {
  const tabOrder = useStore((s) => s.tabOrder);
  const activeTabId = useStore((s) => s.activeTabId);
  const doc = useStore((s) => s.doc);
  const parkedTabs = useStore((s) => s.parkedTabs);
  const activateTab = useStore((s) => s.activateTab);
  const closeTab = useStore((s) => s.closeTab);
  const [pendingClose, setPendingClose] = useState<{ id: string; name: string } | null>(null);

  const docFor = (id: string): DocumentState | undefined => (id === activeTabId ? doc : parkedTabs[id]);

  const close = (id: string) => {
    closeTab(id);
    onAfterClose?.();
  };

  return (
    <>
      <nav className="om-tabs" aria-label={t('tabs.label')} data-om-testid="tab-bar">
        {tabOrder.map((id) => {
          const tabDoc = docFor(id);
          if (!tabDoc) return null;
          const dirty = isDirty(tabDoc);
          const active = id === activeTabId;
          return (
            <div key={id} className="om-tab" data-active={active ? 'true' : undefined} data-om-testid={`tab-${id}`}>
              <button
                type="button"
                aria-current={active ? 'page' : undefined}
                className="om-tab__label"
                title={tabDoc.path ?? tabDoc.name}
                onClick={() => activateTab(id)}
              >
                {tabDoc.readOnly && <LockSimple size={14} className="om-tab__lock" />}
                <span className="om-tab__name" data-om-testid={active ? 'document-name' : undefined}>
                  {tabDoc.name}
                </span>
                {dirty && <span className="om-dirty-dot" role="img" aria-label={t('status.unsaved')} />}
              </button>
              <button
                type="button"
                className="om-tab__close"
                aria-label={`${t('tabs.close')}: ${tabDoc.name}`}
                data-om-testid={`tab-close-${id}`}
                onClick={() => {
                  /*
                   * Closing a tab with unsaved edits discards them, and nothing can bring them
                   * back — the document lives only in memory. Asking is the one place a
                   * confirmation dialog is unambiguously right.
                   */
                  if (dirty) setPendingClose({ id, name: tabDoc.name });
                  else close(id);
                }}
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
      </nav>
      {pendingClose && (
        <ConfirmDialog
          title={t('tabs.close')}
          message={t('tabs.confirmDiscard', { name: pendingClose.name })}
          confirmLabel={t('tabs.discardAndClose')}
          testId="close-tab-dialog"
          onCancel={() => setPendingClose(null)}
          onConfirm={() => {
            const { id } = pendingClose;
            setPendingClose(null);
            close(id);
          }}
        />
      )}
    </>
  );
}
