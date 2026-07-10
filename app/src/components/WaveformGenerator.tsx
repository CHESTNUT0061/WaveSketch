import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Layers } from 'lucide-react';
import { useI18n, type StringKey } from '@/i18n';
import { NumberInput } from '@/components/NumberInput';
import type { WaveformGroup } from '@/types/waveform';

export type WaveformType = 'square' | 'ramp' | 'sine' | 'triangle' | 'sawtooth' | 'trapezoid' | 'rectified' | 'damped';

interface WaveformGeneratorProps {
  onGenerate: (
    type: WaveformType,
    params: {
      amplitude: number;
      period: number;
      dutyCycle: number;
      totalCycles: number;
      startTime: number;
      phaseShift: number;
      offset?: number;
      edgePercent?: number;
      dampingTau?: number;
      complementary?: boolean;
      deadTimePercent?: number;
    },
    groupName: string,
    customColor?: string,
    skipHistorySave?: boolean,
    complementaryName?: string
  ) => void;
  groups: WaveformGroup[];
  onExtendMultiPhase: (groupId: string, phaseCount: number, period: number) => void;
}

// Types that can have a complementary drive signal
const COMP_TYPES: WaveformType[] = ['square', 'trapezoid'];

// Waveform type -> i18n key for its label
const WAVE_TYPE_KEYS: { value: WaveformType; key: StringKey }[] = [
  { value: 'square', key: 'wtSquare' },
  { value: 'ramp', key: 'wtRamp' },
  { value: 'sine', key: 'wtSine' },
  { value: 'triangle', key: 'wtTriangle' },
  { value: 'sawtooth', key: 'wtSawtooth' },
  { value: 'trapezoid', key: 'wtTrapezoid' },
  { value: 'rectified', key: 'wtRectified' },
  { value: 'damped', key: 'wtDamped' },
];

// Waveform types that use the duty-cycle parameter
const DUTY_TYPES: WaveformType[] = ['square', 'ramp', 'triangle', 'trapezoid'];
const DUTY_LABEL_KEYS: Partial<Record<WaveformType, StringKey>> = {
  square: 'dutySquare',
  ramp: 'dutyRamp',
  triangle: 'dutyTriangle',
  trapezoid: 'dutySquare',
};

export const WaveformGenerator: React.FC<WaveformGeneratorProps> = ({ onGenerate, groups, onExtendMultiPhase }) => {
  const { t } = useI18n();
  const waveLabel = (v: WaveformType) => t(WAVE_TYPE_KEYS.find(w => w.value === v)!.key);
  const [type, setType] = useState<WaveformType>('square');
  const [amplitude, setAmplitude] = useState(1);
  const [period, setPeriod] = useState(2);
  const [dutyCycle, setDutyCycle] = useState(50);
  const [totalCycles, setTotalCycles] = useState(3);
  const [startTime, setStartTime] = useState(0);
  const [offset, setOffset] = useState(0);
  const [edgePercent, setEdgePercent] = useState(10);
  const [dampingTau, setDampingTau] = useState(2);
  const [_phaseShift, _setPhaseShift] = useState(0);
  const [enablePhaseShift, setEnablePhaseShift] = useState(false);
  const [phaseCount, setPhaseCount] = useState(4);
  const [enableComplementary, setEnableComplementary] = useState(false);
  const [deadTimePercent, setDeadTimePercent] = useState(5);
  // Multi-phase extension of an existing group
  const [mpGroupId, setMpGroupId] = useState('');
  const [mpPhaseCount, setMpPhaseCount] = useState(2);
  const [mpPeriod, setMpPeriod] = useState(2);

  // Preset colors for multi-phase waveforms
  const PHASE_COLORS = [
    '#3b82f6', // blue
    '#ef4444', // red
    '#10b981', // green
    '#f59e0b', // amber
    '#8b5cf6', // purple
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#84cc16', // lime
    '#f97316', // orange
    '#6366f1', // indigo
  ];

  const handleGenerate = () => {
    if (enablePhaseShift) {
      // Phase step = 360 / phase count
      const autoPhaseStep = 360 / phaseCount;
      // Generate interleaved phases, one group per phase with distinct colors
      // Save history only after the last phase
      for (let i = 0; i < phaseCount; i++) {
        const phase = (i * autoPhaseStep) % 360;
        const color = PHASE_COLORS[i % PHASE_COLORS.length];
        const isLast = i === phaseCount - 1;
        onGenerate(type, {
          amplitude,
          period,
          dutyCycle,
          totalCycles,
          startTime,
          phaseShift: phase,
          offset,
          edgePercent,
          dampingTau,
        }, `${waveLabel(type)}_${i + 1}(${phase.toFixed(1)}°)`, color, !isLast);
      }
    } else {
      // Single group; complementary drive optionally added for square/trapezoid
      const withComp = enableComplementary && COMP_TYPES.includes(type);
      onGenerate(type, {
        amplitude,
        period,
        dutyCycle,
        totalCycles,
        startTime,
        phaseShift: _phaseShift,
        offset,
        edgePercent,
        dampingTau,
        complementary: withComp,
        deadTimePercent,
      }, `${waveLabel(type)}`, undefined, false, withComp ? `${waveLabel(type)}${t('compSuffix')}` : undefined);
    }
  };

  return (
    <div className="p-3 bg-purple-50 rounded border border-purple-200">
      {/* Waveform type */}
      <div className="mb-3">
        <Label className="text-xs text-gray-600 mb-1 block">{t('waveType')}</Label>
        <Select value={type} onValueChange={(v) => setType(v as WaveformType)}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WAVE_TYPE_KEYS.map(w => (
              <SelectItem key={w.value} value={w.value}>{t(w.key)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Parameter row 1 */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <Label className="text-xs text-gray-600 mb-1 block">{t('amplitude')}</Label>
          <NumberInput step="0.1" value={amplitude} onValueChange={setAmplitude} className="h-8" />
        </div>
        <div>
          <Label className="text-xs text-gray-600 mb-1 block">{t('period')}</Label>
          <NumberInput step="0.1" min={0.001} value={period} onValueChange={setPeriod} className="h-8" />
        </div>
      </div>

      {/* Parameter row 2 */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <Label className="text-xs text-gray-600 mb-1 block">{t('totalCycles')}</Label>
          <NumberInput min={1} integer value={totalCycles} onValueChange={setTotalCycles} className="h-8" />
        </div>
        <div>
          <Label className="text-xs text-gray-600 mb-1 block">{t('startTime')}</Label>
          <NumberInput step="0.1" value={startTime} onValueChange={setStartTime} className="h-8" />
        </div>
      </div>

      {/* DC offset (all waveform types) */}
      <div className="mb-2">
        <Label className="text-xs text-gray-600 mb-1 block">{t('dcOffset')}</Label>
        <NumberInput step="0.1" value={offset} onValueChange={setOffset} className="h-8" />
      </div>

      {/* Duty cycle */}
      {DUTY_TYPES.includes(type) && (
        <div className="mb-2">
          <Label className="text-xs text-gray-600 mb-1 block">
            {t(DUTY_LABEL_KEYS[type]!)}
          </Label>
          <NumberInput min={0} max={100} value={dutyCycle} onValueChange={setDutyCycle} className="h-8" />
          {type === 'ramp' && (
            <div className="text-xs text-gray-500 mt-1">
              {t('rampHint')}
            </div>
          )}
          {type === 'triangle' && (
            <div className="text-xs text-gray-500 mt-1">
              {t('triangleHint')}
            </div>
          )}
        </div>
      )}

      {/* Trapezoid edge time */}
      {type === 'trapezoid' && (
        <div className="mb-2">
          <Label className="text-xs text-gray-600 mb-1 block">{t('edgePercent')}</Label>
          <NumberInput min={0.1} max={40} step="0.5" value={edgePercent} onValueChange={setEdgePercent} className="h-8" />
          <div className="text-xs text-gray-500 mt-1">
            {t('edgeHint')}
          </div>
        </div>
      )}

      {/* Damped-ringing decay constant */}
      {type === 'damped' && (
        <div className="mb-2">
          <Label className="text-xs text-gray-600 mb-1 block">{t('dampingTau')}</Label>
          <NumberInput min={0.1} step="0.5" value={dampingTau} onValueChange={setDampingTau} className="h-8" />
          <div className="text-xs text-gray-500 mt-1">
            {t('dampingHint')}
          </div>
        </div>
      )}

      {/* Complementary drive (square/trapezoid only, exclusive with interleaving) */}
      {COMP_TYPES.includes(type) && (
        <div className="mb-3 pt-2 border-t border-purple-200">
          <div className="flex items-center gap-2 mb-2">
            <Checkbox
              id="complementary"
              checked={enableComplementary}
              disabled={enablePhaseShift}
              onCheckedChange={(checked) => setEnableComplementary(checked as boolean)}
            />
            <Label htmlFor="complementary" className="text-xs text-purple-700 cursor-pointer">
              {t('enableComplementary')}
            </Label>
          </div>
          {enableComplementary && (
            <div className="pl-6">
              <Label className="text-xs text-gray-600 mb-1 block">{t('deadTimePercent')}</Label>
              <NumberInput min={0} max={20} step="0.5" value={deadTimePercent} onValueChange={setDeadTimePercent} className="h-8" />
              <div className="text-xs text-gray-500 mt-1">
                {t('deadTimeHint')}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Phase interleaving */}
      <div className="mb-3 pt-2 border-t border-purple-200">
        <div className="flex items-center gap-2 mb-2">
          <Checkbox
            id="phaseShift"
            checked={enablePhaseShift}
            disabled={enableComplementary}
            onCheckedChange={(checked) => setEnablePhaseShift(checked as boolean)}
          />
          <Label htmlFor="phaseShift" className="text-xs text-purple-700 cursor-pointer">
            {t('enablePhase')}
          </Label>
        </div>

        {enablePhaseShift && (
          <div className="pl-6">
            <div className="mb-2">
              <Label className="text-xs text-gray-600 mb-1 block">{t('phaseCount')}</Label>
              <NumberInput min={2} max={12} integer value={phaseCount} onValueChange={setPhaseCount} className="h-8" />
              <div className="text-xs text-gray-500 mt-1">
                {t('phaseDiff', { n: (360 / phaseCount).toFixed(1) })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Generate button */}
      <Button
        size="sm"
        onClick={handleGenerate}
        className="w-full flex items-center gap-1 bg-purple-600 hover:bg-purple-700"
      >
        <Plus className="w-4 h-4" />
        {t('generate')}
      </Button>

      {/* Multi-phase extension of an existing group */}
      <div className="mt-3 pt-3 border-t border-purple-200">
        <Label className="text-xs text-purple-700 mb-2 block">{t('multiPhaseTitle')}</Label>
        <Select value={mpGroupId} onValueChange={setMpGroupId}>
          <SelectTrigger className="h-8 mb-2">
            <SelectValue placeholder={t('selectWaveform')} />
          </SelectTrigger>
          <SelectContent>
            {groups.map(g => (
              <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <Label className="text-xs text-gray-600 mb-1 block">{t('phaseCount')}</Label>
            <NumberInput min={2} max={12} integer value={mpPhaseCount} onValueChange={setMpPhaseCount} className="h-8" />
          </div>
          <div>
            <Label className="text-xs text-gray-600 mb-1 block">{t('period')}</Label>
            <NumberInput min={0.001} step="0.1" value={mpPeriod} onValueChange={setMpPeriod} className="h-8" />
          </div>
        </div>
        <div className="text-xs text-gray-500 mb-2">{t('multiPhaseHint')}</div>
        <Button
          size="sm"
          variant="outline"
          className="w-full flex items-center gap-1"
          disabled={!mpGroupId || !groups.some(g => g.id === mpGroupId)}
          onClick={() => onExtendMultiPhase(mpGroupId, mpPhaseCount, mpPeriod)}
        >
          <Layers className="w-4 h-4" />
          {t('extendBtn')}
        </Button>
      </div>
    </div>
  );
};
