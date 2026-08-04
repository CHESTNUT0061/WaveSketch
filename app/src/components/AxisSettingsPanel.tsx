import React from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/NumberInput';
import { useI18n } from '@/i18n';
import type { AxisConfig } from '@/types/waveform';

const AXIS_EXPANDED_KEY = 'wavesketch.ui.axisSettingsExpanded';

function loadMobileExpanded() {
  try {
    return localStorage.getItem(AXIS_EXPANDED_KEY) === 'true';
  } catch {
    return false;
  }
}

function isCompactViewport() {
  return window.innerWidth < 640 || window.innerHeight < 600;
}

interface AxisSettingsPanelProps {
  axisConfig: AxisConfig;
  onChange: (config: AxisConfig) => void;
}

export function AxisSettingsPanel({ axisConfig, onChange }: AxisSettingsPanelProps) {
  const { t } = useI18n();
  const [mobileExpanded, setMobileExpanded] = React.useState(loadMobileExpanded);
  const [compactViewport, setCompactViewport] = React.useState(isCompactViewport);

  React.useEffect(() => {
    const updateViewport = () => setCompactViewport(isCompactViewport());
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  const toggleMobile = () => {
    setMobileExpanded((expanded) => {
      const next = !expanded;
      try { localStorage.setItem(AXIS_EXPANDED_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const fields = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex min-w-fit flex-1 flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Label className="whitespace-nowrap text-xs text-[var(--ws-muted)]">{t('yUnit')}</Label>
          <Input value={axisConfig.yUnit} onChange={(event) => onChange({ ...axisConfig, yUnit: event.target.value })} className="h-7 w-[4.5rem] bg-white/70 px-2 text-sm" />
        </div>
        <div className="flex items-center gap-2">
          <Label className="whitespace-nowrap text-xs text-[var(--ws-muted)]">{t('minorGrid')}</Label>
          <NumberInput step="0.1" min={0.001} showSteppers value={axisConfig.yGridSize} onValueChange={(value) => onChange({ ...axisConfig, yGridSize: value })} className="h-7 w-[5.25rem] bg-white/70 px-2 text-sm tabular-nums" />
        </div>
        <div className="flex items-center gap-2">
          <Label className="whitespace-nowrap text-xs text-[var(--ws-muted)]">{t('majorGrid')}</Label>
          <NumberInput step="0.5" min={0.001} showSteppers value={axisConfig.yMajorGridSize} onValueChange={(value) => onChange({ ...axisConfig, yMajorGridSize: value })} className="h-7 w-[5.25rem] bg-white/70 px-2 text-sm tabular-nums" />
        </div>
      </div>

      <div className="hidden h-7 w-px bg-[var(--ws-border)] lg:block" />

      <div className="flex min-w-fit flex-1 flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Label className="whitespace-nowrap text-xs text-[var(--ws-muted)]">{t('xUnit')}</Label>
          <Input value={axisConfig.xUnit} onChange={(event) => onChange({ ...axisConfig, xUnit: event.target.value })} className="h-7 w-[4.5rem] bg-white/70 px-2 text-sm" />
        </div>
        <div className="flex items-center gap-2">
          <Label className="whitespace-nowrap text-xs text-[var(--ws-muted)]">{t('minorGrid')}</Label>
          <NumberInput step="0.1" min={0.001} showSteppers value={axisConfig.xGridSize} onValueChange={(value) => onChange({ ...axisConfig, xGridSize: value })} className="h-7 w-[5.25rem] bg-white/70 px-2 text-sm tabular-nums" />
        </div>
        <div className="flex items-center gap-2">
          <Label className="whitespace-nowrap text-xs text-[var(--ws-muted)]">{t('majorGrid')}</Label>
          <NumberInput step="0.5" min={0.001} showSteppers value={axisConfig.xMajorGridSize} onValueChange={(value) => onChange({ ...axisConfig, xMajorGridSize: value })} className="h-7 w-[5.25rem] bg-white/70 px-2 text-sm tabular-nums" />
        </div>
      </div>
    </div>
  );

  const compactFields = (
    <div className="ws-axis-compact grid grid-cols-2 gap-x-3 gap-y-1">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-1">
          <Label className="ws-axis-label w-12 shrink-0 text-xs text-[var(--ws-muted)]">{t('yUnit')}</Label>
          <Input value={axisConfig.yUnit} onChange={(event) => onChange({ ...axisConfig, yUnit: event.target.value })} className="h-6 min-w-0 flex-1 bg-white/70 px-2 text-sm" />
        </div>
        <div className="flex items-center gap-1">
          <Label className="ws-axis-label w-12 shrink-0 text-xs text-[var(--ws-muted)]">{t('minorGrid')}</Label>
          <NumberInput step="0.1" min={0.001} showSteppers value={axisConfig.yGridSize} onValueChange={(value) => onChange({ ...axisConfig, yGridSize: value })} className="h-6 w-12 bg-white/70 px-1 text-sm tabular-nums" />
        </div>
        <div className="flex items-center gap-1">
          <Label className="ws-axis-label w-12 shrink-0 text-xs text-[var(--ws-muted)]">{t('majorGrid')}</Label>
          <NumberInput step="0.5" min={0.001} showSteppers value={axisConfig.yMajorGridSize} onValueChange={(value) => onChange({ ...axisConfig, yMajorGridSize: value })} className="h-6 w-12 bg-white/70 px-1 text-sm tabular-nums" />
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-1">
          <Label className="ws-axis-label w-12 shrink-0 text-xs text-[var(--ws-muted)]">{t('xUnit')}</Label>
          <Input value={axisConfig.xUnit} onChange={(event) => onChange({ ...axisConfig, xUnit: event.target.value })} className="h-6 min-w-0 flex-1 bg-white/70 px-2 text-sm" />
        </div>
        <div className="flex items-center gap-1">
          <Label className="ws-axis-label w-12 shrink-0 text-xs text-[var(--ws-muted)]">{t('minorGrid')}</Label>
          <NumberInput step="0.1" min={0.001} showSteppers value={axisConfig.xGridSize} onValueChange={(value) => onChange({ ...axisConfig, xGridSize: value })} className="h-6 w-12 bg-white/70 px-1 text-sm tabular-nums" />
        </div>
        <div className="flex items-center gap-1">
          <Label className="ws-axis-label w-12 shrink-0 text-xs text-[var(--ws-muted)]">{t('majorGrid')}</Label>
          <NumberInput step="0.5" min={0.001} showSteppers value={axisConfig.xMajorGridSize} onValueChange={(value) => onChange({ ...axisConfig, xMajorGridSize: value })} className="h-6 w-12 bg-white/70 px-1 text-sm tabular-nums" />
        </div>
      </div>
    </div>
  );

  return (
    <section className="ws-surface shrink-0 overflow-hidden rounded-xl" aria-label={t('axisSettings')}>
      {compactViewport ? (
        <>
          <button
            type="button"
            className="flex w-full items-center justify-between px-2 py-1 text-left text-xs font-medium text-[var(--ws-ink)] sm:px-3 sm:py-2 sm:text-sm"
            onClick={toggleMobile}
            aria-expanded={mobileExpanded}
          >
            <span className="flex items-center gap-1.5"><SlidersHorizontal className="size-3.5 text-primary sm:size-4" />{t('axisSettings')}</span>
            <ChevronDown className={`size-3.5 text-primary transition-transform sm:size-4 ${mobileExpanded ? 'rotate-180' : ''}`} />
          </button>
          {mobileExpanded && <div className="border-t border-[var(--ws-border)] p-2 sm:p-3">{compactFields}</div>}
        </>
      ) : (
        <div className="flex items-center gap-4 p-3">
          <div className="flex shrink-0 items-center gap-2 text-sm font-medium text-[var(--ws-ink)]">
            <SlidersHorizontal className="size-4 text-primary" />{t('axisSettings')}
          </div>
          <div className="h-7 w-px shrink-0 bg-[var(--ws-border)]" />
          <div className="min-w-0 flex-1">{fields}</div>
        </div>
      )}
    </section>
  );
}
