import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus } from 'lucide-react';

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
    },
    groupName: string,
    customColor?: string,
    skipHistorySave?: boolean
  ) => void;
}

const WAVE_TYPES: { value: WaveformType; label: string }[] = [
  { value: 'square', label: '方波' },
  { value: 'ramp', label: 'Ramp波（电感电流）' },
  { value: 'sine', label: '正弦波' },
  { value: 'triangle', label: '三角波（PWM载波）' },
  { value: 'sawtooth', label: '锯齿波' },
  { value: 'trapezoid', label: '梯形波（开关节点）' },
  { value: 'rectified', label: '整流正弦 |sin|' },
  { value: 'damped', label: '阻尼振荡（振铃）' },
];

// 使用占空比参数的波形类型
const DUTY_TYPES: WaveformType[] = ['square', 'ramp', 'triangle', 'trapezoid'];
const DUTY_LABELS: Partial<Record<WaveformType, string>> = {
  square: '占空比 (%)',
  ramp: '上升占空比 (%)',
  triangle: '峰值位置 (%)',
  trapezoid: '占空比 (%)',
};

export const WaveformGenerator: React.FC<WaveformGeneratorProps> = ({ onGenerate }) => {
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
          offset,
          edgePercent,
          dampingTau,
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
        offset,
        edgePercent,
        dampingTau,
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

      {/* 直流偏置（所有波形通用） */}
      <div className="mb-2">
        <Label className="text-xs text-gray-600 mb-1 block">直流偏置</Label>
        <Input
          type="number"
          step="0.1"
          value={offset}
          onChange={(e) => setOffset(parseFloat(e.target.value) || 0)}
          className="h-8"
        />
      </div>

      {/* 占空比参数 */}
      {DUTY_TYPES.includes(type) && (
        <div className="mb-2">
          <Label className="text-xs text-gray-600 mb-1 block">
            {DUTY_LABELS[type]}
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
          {type === 'triangle' && (
            <div className="text-xs text-gray-500 mt-1">
              50% 为对称三角波，100% 等效锯齿波
            </div>
          )}
        </div>
      )}

      {/* 梯形波边沿时间 */}
      {type === 'trapezoid' && (
        <div className="mb-2">
          <Label className="text-xs text-gray-600 mb-1 block">边沿时间占比 (%)</Label>
          <Input
            type="number"
            min="0.1"
            max="40"
            step="0.5"
            value={edgePercent}
            onChange={(e) => setEdgePercent(parseFloat(e.target.value) || 10)}
            className="h-8"
          />
          <div className="text-xs text-gray-500 mt-1">
            单个上升/下降沿占周期的百分比
          </div>
        </div>
      )}

      {/* 阻尼振荡衰减时间常数 */}
      {type === 'damped' && (
        <div className="mb-2">
          <Label className="text-xs text-gray-600 mb-1 block">衰减时间常数 τ（周期数）</Label>
          <Input
            type="number"
            min="0.1"
            step="0.5"
            value={dampingTau}
            onChange={(e) => setDampingTau(parseFloat(e.target.value) || 2)}
            className="h-8"
          />
          <div className="text-xs text-gray-500 mt-1">
            幅度按 e^(-t/τT) 衰减，τ 越大振铃持续越久
          </div>
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
