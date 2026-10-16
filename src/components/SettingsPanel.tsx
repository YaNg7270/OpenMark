import { clampZoom, DEFAULT_SETTINGS, ZOOM_MAX, ZOOM_MIN, type AppSettings, type ImageAlign } from '@/app/settings';
import { useStore } from '@/app/store';
import { t } from '@/i18n';

/**
 * Reading and behaviour settings.
 *
 * Every control writes straight to the settings store, which projects onto CSS custom
 * properties — so moving a slider updates the document without re-parsing or re-rendering
 * it. The panel is intentionally all live controls and no "Apply" button.
 */

interface SettingsPanelProps {
  onChange: (mutate: (draft: AppSettings) => AppSettings) => void;
}

export function SettingsPanel({ onChange }: SettingsPanelProps) {
  const settings = useStore((s) => s.settings);
  const { reading, editor, safety } = settings;

  const patchReading = (patch: Partial<AppSettings['reading']>) =>
    onChange((draft) => ({ ...draft, reading: { ...draft.reading, ...patch } }));
  const patchEditor = (patch: Partial<AppSettings['editor']>) =>
    onChange((draft) => ({ ...draft, editor: { ...draft.editor, ...patch } }));
  const patchSafety = (patch: Partial<AppSettings['safety']>) =>
    onChange((draft) => ({ ...draft, safety: { ...draft.safety, ...patch } }));

  return (
    <div className="om-settings">
      <section className="om-settings__group">
        <h3>{t('settings.reading')}</h3>

        <Slider
          label={t('settings.fontSize')}
          value={reading.fontSize}
          min={12}
          max={26}
          step={1}
          suffix="px"
          onChange={(fontSize) => patchReading({ fontSize })}
        />
        <Slider
          label={t('settings.lineHeight')}
          value={reading.lineHeight}
          min={1.2}
          max={2.6}
          step={0.05}
          suffix=""
          onChange={(lineHeight) => patchReading({ lineHeight })}
        />
        <Slider
          label={t('settings.contentWidth')}
          value={reading.contentWidth}
          min={28}
          max={80}
          step={1}
          suffix="rem"
          onChange={(contentWidth) => patchReading({ contentWidth })}
        />
        <Slider
          label={t('settings.density')}
          value={reading.density}
          min={0.7}
          max={1.8}
          step={0.05}
          suffix="×"
          onChange={(density) => patchReading({ density })}
        />
        <Slider
          label={t('settings.mathScale')}
          value={reading.mathScale}
          min={0.7}
          max={1.8}
          step={0.05}
          suffix="×"
          onChange={(mathScale) => patchReading({ mathScale })}
        />
        <Slider
          label={t('settings.imageScale')}
          value={reading.imageScale}
          min={0.4}
          max={2}
          step={0.05}
          suffix="×"
          onChange={(imageScale) => patchReading({ imageScale })}
        />
        <Slider
          label={t('settings.zoom')}
          value={reading.zoom}
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={0.1}
          suffix="×"
          onChange={(zoom) => patchReading({ zoom: clampZoom(zoom) })}
        />
        <Select
          label={t('settings.imageAlign')}
          value={reading.imageAlign}
          options={[
            { value: 'left', label: t('settings.imageAlign.left') },
            { value: 'center', label: t('settings.imageAlign.center') },
            { value: 'right', label: t('settings.imageAlign.right') },
          ]}
          onChange={(imageAlign) => patchReading({ imageAlign: imageAlign as ImageAlign })}
        />

        <Segmented
          label={t('settings.font')}
          name="om-font"
          value={reading.fontFamily}
          options={[
            { value: 'serif', label: t('settings.font.serif') },
            { value: 'sans', label: t('settings.font.sans') },
            { value: 'system', label: t('settings.font.system') },
          ]}
          onChange={(fontFamily) => patchReading({ fontFamily: fontFamily as AppSettings['reading']['fontFamily'] })}
        />

        <Toggle
          label={t('settings.justify')}
          checked={reading.justify}
          onChange={(justify) => patchReading({ justify })}
        />
        <Toggle
          label={t('settings.hyphenate')}
          checked={reading.hyphenate}
          onChange={(hyphenate) => patchReading({ hyphenate })}
        />
        <Toggle
          label={t('settings.numberHeadings')}
          checked={reading.autoNumberHeadings}
          onChange={(autoNumberHeadings) => patchReading({ autoNumberHeadings })}
        />
        <Toggle
          label={t('settings.mathSpeech')}
          checked={reading.mathSpeech}
          onChange={(mathSpeech) => patchReading({ mathSpeech })}
        />
        <Toggle
          label={t('settings.progress')}
          checked={reading.showReadingProgress}
          onChange={(showReadingProgress) => patchReading({ showReadingProgress })}
        />
      </section>

      <section className="om-settings__group">
        <h3>{t('settings.behaviour')}</h3>
        <Toggle
          label={t('settings.autoSave')}
          checked={editor.autoSave}
          onChange={(autoSave) => patchEditor({ autoSave })}
        />
        <Toggle
          label={t('settings.keepBackups')}
          checked={safety.keepBackups}
          onChange={(keepBackups) => patchSafety({ keepBackups })}
        />
        <Toggle
          label={t('settings.safeReadOnly')}
          checked={safety.safeReadOnlyForComplexFiles}
          onChange={(safeReadOnlyForComplexFiles) => patchSafety({ safeReadOnlyForComplexFiles })}
        />
        <Select
          label={t('settings.language')}
          value={settings.language}
          options={[
            { value: 'zh', label: '中文' },
            { value: 'en', label: 'English' },
          ]}
          onChange={(language) => onChange((draft) => ({ ...draft, language: language as 'zh' | 'en' }))}
        />
        <button
          type="button"
          className="om-btn om-btn--ghost om-settings__reset"
          onClick={() => onChange(() => structuredClone(DEFAULT_SETTINGS))}
        >
          {t('settings.reset')}
        </button>
      </section>
    </div>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}

function Slider({ label, value, min, max, step, suffix, onChange }: SliderProps) {
  return (
    <label className="om-field">
      <span className="om-field__label">
        {label}
        <output className="om-field__value">
          {value}
          {suffix}
        </output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

interface SelectProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

function Select({ label, value, options, onChange }: SelectProps) {
  return (
    <label className="om-field om-field--row">
      <span className="om-field__label">{label}</span>
      <select className="om-select" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** A checkbox drawn as Broadsheet's square: the native input stays, for focus and assistive tech. */
function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <label className="om-chk">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="om-chk__box" aria-hidden="true" />
      {label}
    </label>
  );
}

interface SegmentedProps {
  label: string;
  name: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

/** A short exclusive choice, all options visible: a radio group drawn as one segmented strip. */
function Segmented({ label, name, value, options, onChange }: SegmentedProps) {
  return (
    <div className="om-field" role="radiogroup" aria-label={label}>
      <span className="om-field__label">{label}</span>
      <div className="om-seg">
        {options.map((option) => (
          <label key={option.value} className="om-seg__opt">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}
