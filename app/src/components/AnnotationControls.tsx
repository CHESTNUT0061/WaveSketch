import type { TextAnnotation } from '@/types/waveform';
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
}

export function AnnotationEditorFields({ annotation, waveformColors, onUpdate, onCommit, onDelete }: AnnotationEditorFieldsProps) {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      <div className="font-medium">{t('annotationSettings')}</div>
          <Input
            aria-label={t('annotationText')}
            value={annotation.text}
            onChange={event => onUpdate({ text: event.target.value })}
            onBlur={onCommit}
          />
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
                    className={`size-6 rounded-full border-2 shadow-sm transition-transform hover:scale-110 ${annotation.color.toLowerCase() === option.color.toLowerCase() ? 'border-primary ring-2 ring-primary/25' : 'border-white'}`}
                    style={{ backgroundColor: option.color }}
                    onClick={() => { onUpdate({ color: option.color }); requestAnimationFrame(onCommit); }}
                  />
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs text-[var(--ws-muted)]">
              <span>{t('annotationFont')}</span>
              <select
                aria-label={t('annotationFont')}
                className="h-8 w-full rounded-md border bg-white px-2 text-sm text-[var(--ws-ink)]"
                value={annotation.fontFamily}
                onChange={event => { onUpdate({ fontFamily: event.target.value as TextAnnotation['fontFamily'] }); requestAnimationFrame(onCommit); }}
              >
                {FONTS.map(font => <option key={font} value={font}>{font}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs text-[var(--ws-muted)]">
              <span>{t('annotationSize')}</span>
              <NumberInput aria-label={t('annotationSize')} min={0.1} max={5} step="0.1" value={annotation.fontSize} onValueChange={value => onUpdate({ fontSize: value })} onValueCommit={onCommit} className="h-8 w-full" />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input aria-label={t('annotationColor')} type="color" value={annotation.color} onChange={event => onUpdate({ color: event.target.value })} onBlur={onCommit} className="h-8 w-10" />
            <Button type="button" size="sm" variant={annotation.fontWeight === 'bold' ? 'default' : 'outline'} onClick={() => { onUpdate({ fontWeight: annotation.fontWeight === 'bold' ? 'normal' : 'bold' }); requestAnimationFrame(onCommit); }}>B</Button>
            <Button type="button" size="sm" variant={annotation.fontStyle === 'italic' ? 'default' : 'outline'} className="italic" onClick={() => { onUpdate({ fontStyle: annotation.fontStyle === 'italic' ? 'normal' : 'italic' }); requestAnimationFrame(onCommit); }}>I</Button>
            <select
              aria-label={t('annotationAlign')}
              className="h-8 min-w-0 flex-1 rounded-md border bg-white px-2 text-sm"
              value={annotation.textAnchor}
              onChange={event => { onUpdate({ textAnchor: event.target.value as TextAnnotation['textAnchor'] }); requestAnimationFrame(onCommit); }}
            >
              <option value="start">{t('alignLeft')}</option>
              <option value="middle">{t('alignCenter')}</option>
              <option value="end">{t('alignRight')}</option>
            </select>
          </div>
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
