import type { AnnotationRunStyle, AnnotationVerticalAlign, TextAnnotation } from '@/types/waveform';
import { Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/NumberInput';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useI18n } from '@/i18n';

interface AnnotationControlsProps {
  annotation?: TextAnnotation;
  waveformColors: WaveformColorOption[];
  onUpdate: (patch: Partial<Omit<TextAnnotation, 'id'>>) => void;
  onCommit: () => void;
  onDelete: () => void;
}

const FONTS: TextAnnotation['fontFamily'][] = ['Arial', 'Times New Roman', 'Courier New', 'Microsoft YaHei'];

export interface WaveformColorOption {
  name: string;
  color: string;
}

interface AnnotationEditorFieldsProps {
  annotation: TextAnnotation;
  waveformColors: WaveformColorOption[];
  onUpdate: (patch: Partial<Omit<TextAnnotation, 'id'>>) => void;
  onCommit: () => void;
  onDelete: () => void;
  formatTarget?: 'selection' | 'box';
  formatValue?: Required<AnnotationRunStyle>;
  onApplyCharacterStyle?: (patch: AnnotationRunStyle) => void;
  onClearCharacterStyle?: () => void;
}

interface AnnotationCharacterControlsProps {
  target: 'selection' | 'box';
  value: Required<AnnotationRunStyle>;
  waveformColors: WaveformColorOption[];
  onApply: (patch: AnnotationRunStyle) => void;
  onClear: () => void;
  onCommit: () => void;
}

export function AnnotationCharacterControls({ target, value, waveformColors, onApply, onClear, onCommit }: AnnotationCharacterControlsProps) {
  const { t } = useI18n();
  return (
    <div className="space-y-2.5">
      <div className="text-xs font-medium text-primary">{t(target === 'selection' ? 'annotationTargetSelection' : 'annotationTargetBox')}</div>
      {waveformColors.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs text-[var(--ws-muted)]">{t('annotationWaveformColors')}</div>
          <div className="flex flex-wrap gap-1.5">
            {waveformColors.map(option => (
              <button
                key={`${option.name}-${option.color}`}
                type="button"
                aria-label={`${t('useWaveformColor')} ${option.name}`}
                title={`${option.name} · ${option.color}`}
                className={`size-6 rounded-full border-2 shadow-sm transition-transform hover:scale-110 ${value.color.toLowerCase() === option.color.toLowerCase() ? 'border-primary ring-2 ring-primary/25' : 'border-white'}`}
                style={{ backgroundColor: option.color }}
                onClick={() => { onApply({ color: option.color }); requestAnimationFrame(onCommit); }}
              />
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-xs text-[var(--ws-muted)]">
          <span>{t('annotationFont')}</span>
          <select aria-label={t('annotationFont')} className="h-8 w-full rounded-md border bg-white px-2 text-sm text-[var(--ws-ink)]" value={value.fontFamily} onChange={event => { onApply({ fontFamily: event.target.value as TextAnnotation['fontFamily'] }); requestAnimationFrame(onCommit); }}>
            {FONTS.map(font => <option key={font} value={font}>{font}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs text-[var(--ws-muted)]">
          <span>{t('annotationSize')}</span>
          <NumberInput aria-label={t('annotationSize')} min={0.1} max={5} step="0.1" value={value.fontSize} onValueChange={fontSize => onApply({ fontSize })} onValueCommit={onCommit} className="h-8 w-full" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          aria-label={t('annotationColor')}
          type="color"
          value={value.color}
          onInput={event => onApply({ color: event.currentTarget.value })}
          onChange={event => onApply({ color: event.currentTarget.value })}
          onBlur={onCommit}
          className="h-8 w-10"
        />
        <Button type="button" size="sm" variant={value.fontWeight === 'bold' ? 'default' : 'outline'} onClick={() => { onApply({ fontWeight: value.fontWeight === 'bold' ? 'normal' : 'bold' }); requestAnimationFrame(onCommit); }}>B</Button>
        <Button type="button" size="sm" variant={value.fontStyle === 'italic' ? 'default' : 'outline'} className="italic" onClick={() => { onApply({ fontStyle: value.fontStyle === 'italic' ? 'normal' : 'italic' }); requestAnimationFrame(onCommit); }}>I</Button>
        <Button type="button" size="sm" variant={value.verticalAlign === 'super' ? 'default' : 'outline'} onClick={() => { onApply({ verticalAlign: value.verticalAlign === 'super' ? 'baseline' : 'super' }); requestAnimationFrame(onCommit); }} title={t('annotationSuperscript')}>x⁺</Button>
        <Button type="button" size="sm" variant={value.verticalAlign === 'sub' ? 'default' : 'outline'} onClick={() => { onApply({ verticalAlign: value.verticalAlign === 'sub' ? 'baseline' : 'sub' }); requestAnimationFrame(onCommit); }} title={t('annotationSubscript')}>x₋</Button>
      </div>
      <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => { onClear(); requestAnimationFrame(onCommit); }}>{t('annotationClearFormat')}</Button>
    </div>
  );
}

export function AnnotationEditorFields({ annotation, waveformColors, onUpdate, onCommit, onDelete, formatTarget = 'box', formatValue, onApplyCharacterStyle, onClearCharacterStyle }: AnnotationEditorFieldsProps) {
  const { t } = useI18n();
  const boxValue: Required<AnnotationRunStyle> = {
    color: annotation.color,
    fontFamily: annotation.fontFamily,
    fontSize: annotation.fontSize,
    fontWeight: annotation.fontWeight,
    fontStyle: annotation.fontStyle,
    verticalAlign: 'baseline' as AnnotationVerticalAlign,
  };
  const applyStyle = onApplyCharacterStyle ?? ((patch: AnnotationRunStyle) => onUpdate(patch));
  return (
    <div className="space-y-3">
      <div className="font-medium">{t('annotationSettings')}</div>
      <Input aria-label={t('annotationText')} value={annotation.text} onChange={event => onUpdate({ text: event.target.value })} onBlur={onCommit} />
      <AnnotationCharacterControls target={formatTarget} value={formatValue ?? boxValue} waveformColors={waveformColors} onApply={applyStyle} onClear={onClearCharacterStyle ?? (() => undefined)} onCommit={onCommit} />
      <label className="block space-y-1 text-xs text-[var(--ws-muted)]">
        <span>{t('annotationAlign')}</span>
        <select aria-label={t('annotationAlign')} className="h-8 w-full rounded-md border bg-white px-2 text-sm" value={annotation.textAnchor} onChange={event => { onUpdate({ textAnchor: event.target.value as TextAnnotation['textAnchor'] }); requestAnimationFrame(onCommit); }}>
          <option value="start">{t('alignLeft')}</option>
          <option value="middle">{t('alignCenter')}</option>
          <option value="end">{t('alignRight')}</option>
        </select>
      </label>
      <Button type="button" variant="destructive" size="sm" className="w-full" onClick={onDelete}>{t('deleteAnnotation')}</Button>
    </div>
  );
}

export function AnnotationControls({ annotation, waveformColors, onUpdate, onCommit, onDelete }: AnnotationControlsProps) {
  const { t } = useI18n();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={!annotation} className="flex items-center gap-1" title={t('annotationSettings')}>
          <Type className="size-4" />{t('annotationSettings')}
        </Button>
      </PopoverTrigger>
      {annotation && (
        <PopoverContent align="start" className="w-72">
          <AnnotationEditorFields annotation={annotation} waveformColors={waveformColors} onUpdate={onUpdate} onCommit={onCommit} onDelete={onDelete} />
        </PopoverContent>
      )}
    </Popover>
  );
}
