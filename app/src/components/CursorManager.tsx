import React from 'react';
import { Crosshair, Eye, EyeOff, LocateFixed, Plus, Trash2 } from 'lucide-react';
import type { AxisConfig, AxisCursor } from '@/types/waveform';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { NumberInput } from '@/components/NumberInput';
import { useI18n } from '@/i18n';

interface CursorManagerProps {
  cursors: AxisCursor[];
  axisConfig: AxisConfig;
  includeCursorsInExport: boolean;
  onCreate: (axis: AxisCursor['axis']) => void;
  onUpdate: (id: string, value: number) => void;
  onCommit: () => void;
  onToggleVisibility: (id: string) => void;
  onFocus: (id: string) => void;
  onDelete: (id: string) => void;
  onIncludeInExportChange: (value: boolean) => void;
}

export const CursorManager: React.FC<CursorManagerProps> = ({
  cursors,
  axisConfig,
  includeCursorsInExport,
  onCreate,
  onUpdate,
  onCommit,
  onToggleVisibility,
  onFocus,
  onDelete,
  onIncludeInExportChange,
}) => {
  const { t } = useI18n();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center gap-1">
          <Crosshair className="h-4 w-4" />
          {t('cursorTitle')}
          {cursors.length > 0 && <span className="text-[10px] text-gray-500">({cursors.length})</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(24rem,calc(100vw-1rem))] p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="font-semibold text-sm">{t('cursorManager')}</div>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => onCreate('x')}>
              <Plus className="h-3.5 w-3.5" />{t('addXCursor')}
            </Button>
            <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => onCreate('y')}>
              <Plus className="h-3.5 w-3.5" />{t('addYCursor')}
            </Button>
          </div>
        </div>

        <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {cursors.length === 0 && (
            <div className="rounded border border-dashed p-4 text-center text-xs text-gray-400">{t('noCursors')}</div>
          )}
          {cursors.map(cursor => {
            const unit = cursor.axis === 'x' ? axisConfig.xUnit : axisConfig.yUnit;
            return (
              <div key={cursor.id} className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-1.5 rounded border bg-white p-1.5">
                <span className="text-xs font-semibold text-gray-700">{cursor.label}</span>
                <div className="flex min-w-0 items-center gap-1">
                  <NumberInput
                    value={cursor.value}
                    step="any"
                    onValueChange={value => onUpdate(cursor.id, value)}
                    onValueCommit={onCommit}
                    aria-label={`${cursor.label} ${t('cursorCoordinate')}`}
                    className="h-7 min-w-0 px-2 text-xs font-mono"
                  />
                  {unit && <span className="max-w-12 truncate text-[11px] text-gray-400" title={unit}>{unit}</span>}
                </div>
                <div className="flex items-center gap-0.5">
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`${cursor.label}: ${cursor.visible ? t('cursorHide') : t('cursorShow')}`} title={cursor.visible ? t('cursorHide') : t('cursorShow')} onClick={() => onToggleVisibility(cursor.id)}>
                    {cursor.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`${cursor.label}: ${t('cursorLocate')}`} title={t('cursorLocate')} onClick={() => onFocus(cursor.id)}>
                    <LocateFixed className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" aria-label={`${cursor.label}: ${t('cursorDelete')}`} title={t('cursorDelete')} onClick={() => onDelete(cursor.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
          <div>
            <Label htmlFor="export-cursors" className="text-xs font-medium">{t('exportCursors')}</Label>
            <div className="mt-0.5 text-[10px] text-gray-400">{t('cursorDragHint')}</div>
          </div>
          <Switch id="export-cursors" checked={includeCursorsInExport} onCheckedChange={onIncludeInExportChange} />
        </div>
      </PopoverContent>
    </Popover>
  );
};
