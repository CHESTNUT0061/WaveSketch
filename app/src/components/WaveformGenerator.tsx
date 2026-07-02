import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus } from 'lucide-react';

export type WaveformType = 'square' | 'ramp' | 'sine';

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
    },
    groupName: string,
    customColor?: string,
    skipHistorySave?: boolean
  ) => void;
}

const WAVE_TYPES: { value: WaveformType; label: string }[] = [
  { value: 'square', label: '方波' },
  { value: 'ramp', label: 'Ramp波' },
  { value: 'sine', label: '正弦波' },
];

export const WaveformGenerator: React.FC<WaveformGeneratorProps> = ({ onGenerate }) => {
  const [type, setType] = useState<WaveformType>('square');
  const [amplitude, setAmplitude] = useState(1);
  const [period, setPeriod] = useState(2);
  const [dutyCycle, setDutyCycle] = useState(50);
  const [totalCycles, setTotalCycles] = useState(3);
  const [startTime, setStartTime] = useState(0);
  const [_phaseShift, _setPhaseShift] = useState(0);
  const [enablePhaseShift, setEnablePhaseShift] = useState(false);
  const [phaseCount, setPhaseCount] = useState(4);

  // 预定义的颜色数组（用于多相波形）
  const PHASE_COLORS = [
    '#3b82f6', // 蓝色
    '#ef4444', // 红色
    '#10b981', // 绿色
    '#f59e0b', // 黄色
    '#8b5cf6', // 紫色
    '#ec4899', // 粉色
    '#06b6d4', // 青色
    '#84cc16', // 黄绿
    '#f97316', // 橙色
    '#6366f1', // 靛蓝
  ];

  const handleGenerate = () => {
    if (enablePhaseShift) {
      // 自动生成相位差 = 360 / 相数
      const autoPhaseStep = 360 / phaseCount;
      // 生成多组错相波形，每组使用不同颜色
      // 只在最后一相保存历史记录
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
        }, `${WAVE_TYPES.find(w => w.value === type)?.label}_${i + 1}(${phase.toFixed(1)}°)`, color, !isLast);
      }
    } else {
      // 生成单组波形
      onGenerate(type, {
        amplitude,
        period,
        dutyCycle,
        totalCycles,
        startTime,
        phaseShift: _phaseShift,
      }, `${WAVE_TYPES.find(w => w.value === type)?.label}`);
    }
  };

  return (
    <div className="p-3 bg-purple-50 rounded border border-purple-200">
      {/* 波形类型 */}
      <div className="mb-3">
        <Label className="text-xs text-gray-600 mb-1 block">波形类型</Label>
        <Select value={type} onValueChange={(v) => setType(v as WaveformType)}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WAVE_TYPES.map(w => (
              <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 参数行1 */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <Label className="text-xs text-gray-600 mb-1 block">幅度</Label>
          <Input
            type="number"
            step="0.1"
            value={amplitude}
            onChange={(e) => setAmplitude(parseFloat(e.target.value) || 1)}
            className="h-8"
          />
        </div>
        <div>
          <Label className="text-xs text-gray-600 mb-1 block">周期</Label>
          <Input
            type="number"
            step="0.1"
            value={period}
            onChange={(e) => setPeriod(parseFloat(e.target.value) || 1)}
            className="h-8"
          />
        </div>
      </div>

      {/* 参数行2 */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <Label className="text-xs text-gray-600 mb-1 block">总周期数</Label>
          <Input
            type="number"
            min="1"
            value={totalCycles}
            onChange={(e) => setTotalCycles(parseInt(e.target.value) || 1)}
            className="h-8"
          />
        </div>
        <div>
          <Label className="text-xs text-gray-600 mb-1 block">开始时间</Label>
          <Input
            type="number"
            step="0.1"
            value={startTime}
            onChange={(e) => setStartTime(parseFloat(e.target.value) || 0)}
            className="h-8"
          />
        </div>
      </div>

      {/* 占空比参数（方波和Ramp波） */}
      {(type === 'square' || type === 'ramp') && (
        <div className="mb-2">
          <Label className="text-xs text-gray-600 mb-1 block">
            {type === 'square' ? '占空比 (%)' : '上升占空比 (%)'}
          </Label>
          <Input
            type="number"
            min="0"
            max="100"
            value={dutyCycle}
            onChange={(e) => setDutyCycle(parseFloat(e.target.value) || 50)}
            className="h-8"
          />
          {type === 'ramp' && (
            <div className="text-xs text-gray-500 mt-1">
              类似电感电流：上升沿占空比，下降沿为剩余时间
            </div>
          )}
        </div>
      )}

      {/* 错相功能 */}
      <div className="mb-3 pt-2 border-t border-purple-200">
        <div className="flex items-center gap-2 mb-2">
          <Checkbox
            id="phaseShift"
            checked={enablePhaseShift}
            onCheckedChange={(checked) => setEnablePhaseShift(checked as boolean)}
          />
          <Label htmlFor="phaseShift" className="text-xs text-purple-700 cursor-pointer">
            启用错相功能
          </Label>
        </div>

        {enablePhaseShift && (
          <div className="pl-6">
            <div className="mb-2">
              <Label className="text-xs text-gray-600 mb-1 block">相数</Label>
              <Input
                type="number"
                min="2"
                max="12"
                value={phaseCount}
                onChange={(e) => setPhaseCount(parseInt(e.target.value) || 2)}
                className="h-8"
              />
              <div className="text-xs text-gray-500 mt-1">
                相位差: {(360 / phaseCount).toFixed(1)}°
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 生成按钮 */}
      <Button
        size="sm"
        onClick={handleGenerate}
        className="w-full flex items-center gap-1 bg-purple-600 hover:bg-purple-700"
      >
        <Plus className="w-4 h-4" />
        生成波形
      </Button>
    </div>
  );
};
