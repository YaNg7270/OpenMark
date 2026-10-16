import { beforeEach, describe, expect, it } from 'vitest';

/**
 * The Broadsheet shell splits what used to be one sidebar slot in two: the margin on the left
 * (outline, search, diagnostics, recent) and the settings drawer on the right. They must be
 * independent — opening settings used to replace the outline, which is the reason for the split.
 */
const { useStore } = await import('@/app/store');

const ui = () => useStore.getState().ui;

beforeEach(() => {
  useStore.setState((s) => ({ ui: { ...s.ui, sidebar: 'outline', lastSidebar: 'outline', settingsOpen: false } }));
});

describe('margin and settings drawer', () => {
  it('opens settings without closing the margin panel', () => {
    useStore.getState().toggleSettings();
    expect(ui().settingsOpen).toBe(true);
    expect(ui().sidebar).toBe('outline');
    useStore.getState().toggleSettings(false);
    expect(ui().settingsOpen).toBe(false);
    expect(ui().sidebar).toBe('outline');
  });

  it('selecting the current panel again keeps it open rather than hiding the margin', () => {
    useStore.getState().setSidebar('search');
    useStore.getState().setSidebar('search');
    expect(ui().sidebar).toBe('search');
  });

  it('the margin toggle hides the margin and brings it back on the panel it last showed', () => {
    useStore.getState().setSidebar('diagnostics');
    useStore.getState().toggleMargin();
    expect(ui().sidebar).toBeNull();
    useStore.getState().toggleMargin();
    expect(ui().sidebar).toBe('diagnostics');
  });

  it('choosing a panel while the margin is hidden shows the margin on that panel', () => {
    useStore.getState().toggleMargin();
    useStore.getState().setSidebar('recent');
    expect(ui().sidebar).toBe('recent');
  });
});
