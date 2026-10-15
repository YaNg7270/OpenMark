import { useStore, isDirty, type DocumentState } from '@/app/store';
import { t } from '@/i18n';

/**
 * Document tab bar.
 *
 * A tab's displayed state comes from whichever document holds it — the active one lives in
 * `doc` and the rest in `parkedTabs`. The bar therefore reads both, and a dirty marker is
 * computed from the parked document rather than remembered, so it cannot go stale.
 *
 * Hidden entirely when only one tab is open: a single-tab tab bar is chrome that says nothing.
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

  if (tabOrder.length <= 1) return null;

  const docFor = (id: string): DocumentState | undefined =>
    id === activeTabId ? doc : parkedTabs[id];

  return (
    <div className="om-tabs" role="tablist" aria-label={t('tabs.label')} data-om-testid="tab-bar">
      {tabOrder.map((id) => {
        const tabDoc = docFor(id);
        if (!tabDoc) return null;
        const dirty = isDirty(tabDoc);
        const active = id === activeTabId;
        return (
          <div key={id} className="om-tab" data-active={active ? 'true' : undefined} data-om-testid={`tab-${id}`}>
            <button
              type="button"
              role="tab"
              aria-selected={active}
              className="om-tab__label"
              title={tabDoc.path ?? tabDoc.name}
              onClick={() => activateTab(id)}
            >
              <span className="om-tab__name">{tabDoc.name}</span>
              {dirty && <span className="om-tab__dirty" aria-label={t('status.unsaved')} />}
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
                if (dirty && !window.confirm(t('tabs.confirmDiscard', { name: tabDoc.name }))) return;
                closeTab(id);
                onAfterClose?.();
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
