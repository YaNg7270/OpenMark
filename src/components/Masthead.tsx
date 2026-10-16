import { useEffect, useRef, useState } from 'react';
import { useStore, type ViewMode } from '@/app/store';
import { t } from '@/i18n';
import {
  CaretDown,
  CircleHalf,
  FileHtml,
  FilePdf,
  FilePlus,
  FolderOpen,
  Copy,
  FrameCorners,
  Moon,
  SidebarSimple,
  SlidersHorizontal,
  Sun,
  TextAlignCenter,
} from './icons';

/**
 * The masthead: the paper's nameplate, the four view modes, and the window's commands.
 *
 * Modes are a tab row because they are mutually exclusive views of one document, and each
 * carries its Ctrl+number as a superscript so the shortcut is learnt by looking. The file
 * commands live behind one menu — they are occasional — while Save, the frequent one, stays a
 * single click away as the only filled button in the window.
 */

const MODES: { id: ViewMode; key: string }[] = [
  { id: 'read', key: 'mode.read' },
  { id: 'instant', key: 'mode.instant' },
  { id: 'source', key: 'mode.source' },
  { id: 'split', key: 'mode.split' },
];

/**
 * Which view modes are implemented.
 *
 * Unavailable modes are hidden rather than shown broken, so the control never offers
 * something that does not work.
 */
export const AVAILABLE_MODES: Record<ViewMode, boolean> = {
  read: true,
  instant: true,
  source: true,
  split: true,
};

interface MastheadProps {
  onOpen: () => void;
  onNew: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onToggleTheme: () => void;
  onExportHtml: () => void;
  onExportPdf: () => void;
}

export function Masthead({ onOpen, onNew, onSave, onSaveAs, onToggleTheme, onExportHtml, onExportPdf }: MastheadProps) {
  const mode = useStore((s) => s.ui.mode);
  const marginOpen = useStore((s) => s.ui.sidebar !== null);
  const settingsOpen = useStore((s) => s.ui.settingsOpen);
  const theme = useStore((s) => s.settings.reading.theme);
  const focusMode = useStore((s) => s.settings.reading.focusMode);
  const typewriterMode = useStore((s) => s.settings.reading.typewriterMode);
  const doc = useStore((s) => s.doc);
  const setMode = useStore((s) => s.setMode);
  const toggleMargin = useStore((s) => s.toggleMargin);
  const toggleSettings = useStore((s) => s.toggleSettings);
  const updateSettings = useStore((s) => s.updateSettings);

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : CircleHalf;

  return (
    <header className="om-mast">
      <div className="om-mast__brand">
        {t('app.name')}
        <small>{t('app.edition')}</small>
      </div>

      <nav className="om-modes" role="tablist" aria-label={t('mode.label')}>
        {MODES.filter((m) => AVAILABLE_MODES[m.id]).map((m, index) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            className="om-mode"
            data-om-testid={`mode-${m.id}`}
            title={`${t(m.key)} · Ctrl+${index + 1}`}
            onClick={() => setMode(m.id)}
          >
            {t(m.key)}
            <sup aria-hidden="true">{index + 1}</sup>
          </button>
        ))}
      </nav>

      <div className="om-mast__end">
        <button
          type="button"
          className="om-ibtn"
          title={t('toolbar.margin')}
          aria-label={t('toolbar.margin')}
          aria-pressed={marginOpen}
          data-om-testid="margin-toggle"
          onClick={toggleMargin}
        >
          <SidebarSimple />
        </button>
        <button
          type="button"
          className="om-ibtn"
          title={`${t('toolbar.focus')} · F8`}
          aria-label={t('toolbar.focus')}
          aria-pressed={focusMode}
          data-om-testid="focus-toggle"
          onClick={() => updateSettings((draft) => ({ ...draft, reading: { ...draft.reading, focusMode: !focusMode } }))}
        >
          <FrameCorners />
        </button>
        <button
          type="button"
          className="om-ibtn"
          title={`${t('toolbar.typewriter')} · F9`}
          aria-label={t('toolbar.typewriter')}
          aria-pressed={typewriterMode}
          data-om-testid="typewriter-toggle"
          onClick={() =>
            updateSettings((draft) => ({ ...draft, reading: { ...draft.reading, typewriterMode: !typewriterMode } }))
          }
        >
          <TextAlignCenter />
        </button>
        <button
          type="button"
          className="om-ibtn"
          title={t(`toolbar.theme.${theme}`)}
          aria-label={`${t('toolbar.theme')}: ${t(`toolbar.theme.${theme}`)}`}
          data-om-testid="theme-toggle"
          onClick={onToggleTheme}
        >
          <ThemeIcon />
        </button>
        <button
          type="button"
          className="om-ibtn"
          title={`${t('toolbar.settings')} · Ctrl+,`}
          aria-label={t('toolbar.settings')}
          aria-pressed={settingsOpen}
          data-om-testid="panel-settings"
          onClick={() => toggleSettings()}
        >
          <SlidersHorizontal />
        </button>

        <FileMenu
          items={[
            { id: 'new-button', icon: FilePlus, label: t('toolbar.new'), kbd: 'Ctrl+N', onSelect: onNew },
            { id: 'open-button', icon: FolderOpen, label: `${t('toolbar.open')}…`, kbd: 'Ctrl+O', onSelect: onOpen },
            {
              id: 'save-as-button',
              icon: Copy,
              label: `${t('toolbar.saveAs')}…`,
              kbd: 'Ctrl+Shift+S',
              onSelect: onSaveAs,
              // Stays enabled for a read-only document: writing a copy modifies nothing it opened.
              disabled: !doc.source,
              groupStart: false,
            },
            {
              id: 'export-html',
              icon: FileHtml,
              label: t('toolbar.exportHtml'),
              onSelect: onExportHtml,
              /*
               * Export needs a path: a self-contained HTML file resolves relative images against
               * the document's directory, and offering it before then would produce a broken export.
               */
              disabled: !doc.path || !doc.render,
              groupStart: true,
            },
            {
              id: 'export-pdf',
              icon: FilePdf,
              label: t('toolbar.exportPdf'),
              onSelect: onExportPdf,
              disabled: !doc.path || !doc.render,
            },
          ]}
        />

        <button
          type="button"
          className="om-btn om-btn--primary"
          onClick={onSave}
          disabled={doc.readOnly || !doc.path}
          data-om-testid="save-button"
        >
          {t('toolbar.save')}
        </button>
      </div>
    </header>
  );
}

interface MenuItem {
  id: string;
  icon: (props: { size?: number }) => React.JSX.Element;
  label: string;
  kbd?: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Starts a new group: the menu separates groups with space, never a rule. */
  groupStart?: boolean;
}

/**
 * A menu button. Closes on choice, on Escape (returning focus to the button), and on any press
 * outside it; the arrow keys move between the enabled items.
 */
function FileMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      // The window's Escape (leave focus mode, leave fullscreen) is not what the reader meant.
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const enabled = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const at = enabled.indexOf(document.activeElement as HTMLButtonElement);
    const next = (at + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length;
    enabled[next]?.focus();
  };

  return (
    <div className="om-menu-wrap" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="om-btn om-btn--secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        data-om-testid="file-menu"
        onClick={() => setOpen((value) => !value)}
      >
        {t('toolbar.file')}
        <CaretDown size={14} />
      </button>
      {open && (
        <div className="om-menu" role="menu" aria-label={t('toolbar.file')} ref={menuRef} onKeyDown={onMenuKeyDown}>
          {items.map(({ id, icon: Icon, label, kbd, onSelect, disabled, groupStart }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              className="om-menu__item"
              data-group-start={groupStart ? 'true' : undefined}
              data-om-testid={id}
              disabled={disabled}
              onClick={() => {
                setOpen(false);
                onSelect();
              }}
            >
              <Icon />
              {label}
              {kbd && <kbd>{kbd}</kbd>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
