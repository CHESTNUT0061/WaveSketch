import type { Point } from '../types/waveform.ts';

export type WaveformType = 'square' | 'ramp' | 'sine' | 'triangle' | 'trapezoid' | 'rectified' | 'damped';

export interface GenerateParams {
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
}

export function buildWaveformPoints(type: WaveformType, params: GenerateParams): Point[] {
  const { amplitude, period, dutyCycle, totalCycles, startTime, phaseShift } = params;
  const offset = params.offset ?? 0;
  const phaseOffset = (phaseShift / 360) * period;
  const points: Point[] = [];

  if (type === 'square') {
    const dutyTime = (dutyCycle / 100) * period;
    const lowLevel = -amplitude;
    const highLevel = amplitude;
    for (let cycle = 0; cycle < totalCycles; cycle++) {
      const cycleStart = startTime + cycle * period + phaseOffset;
      points.push({ x: cycleStart, y: lowLevel });
      points.push({ x: cycleStart, y: highLevel });
      points.push({ x: cycleStart + dutyTime, y: highLevel });
      points.push({ x: cycleStart + dutyTime, y: lowLevel });
      points.push({ x: cycleStart + period, y: lowLevel });
    }
  } else if (type === 'ramp') {
    // Linear rise across each full period, followed by an instantaneous reset.
    for (let cycle = 0; cycle < totalCycles; cycle++) {
      const cycleStart = startTime + cycle * period + phaseOffset;
      points.push({ x: cycleStart, y: -amplitude });
      points.push({ x: cycleStart + period, y: amplitude });
      points.push({ x: cycleStart + period, y: -amplitude });
    }
  } else if (type === 'sine') {
    const samplesPerPeriod = 20;
    const totalSamples = Math.ceil(samplesPerPeriod * totalCycles);
    const dt = period / samplesPerPeriod;
    const phaseRad = (phaseShift * Math.PI) / 180;
    for (let i = 0; i <= totalSamples; i++) {
      const t = startTime + i * dt;
      const normalizedT = ((t - startTime) / period) * 2 * Math.PI + phaseRad;
      points.push({ x: t, y: amplitude * Math.sin(normalizedT) });
    }
  } else if (type === 'triangle') {
    const peakTime = (dutyCycle / 100) * period;
    for (let cycle = 0; cycle < totalCycles; cycle++) {
      const cycleStart = startTime + cycle * period + phaseOffset;
      points.push({ x: cycleStart, y: -amplitude });
      points.push({ x: cycleStart + peakTime, y: amplitude });
    }
    points.push({ x: startTime + totalCycles * period + phaseOffset, y: -amplitude });
  } else if (type === 'trapezoid') {
    const edgeFrac = Math.max(0.1, Math.min(40, params.edgePercent ?? 10)) / 100;
    const edgeTime = edgeFrac * period;
    const highTime = Math.max(0, (dutyCycle / 100) * period - edgeTime);
    for (let cycle = 0; cycle < totalCycles; cycle++) {
      const cycleStart = startTime + cycle * period + phaseOffset;
      points.push({ x: cycleStart, y: -amplitude });
      points.push({ x: cycleStart + edgeTime, y: amplitude });
      points.push({ x: cycleStart + edgeTime + highTime, y: amplitude });
      points.push({ x: cycleStart + 2 * edgeTime + highTime, y: -amplitude });
      points.push({ x: cycleStart + period, y: -amplitude });
    }
  } else if (type === 'rectified') {
    const samplesPerPeriod = 20;
    const totalSamples = Math.ceil(samplesPerPeriod * totalCycles);
    const dt = period / samplesPerPeriod;
    const phaseRad = (phaseShift * Math.PI) / 180;
    for (let i = 0; i <= totalSamples; i++) {
      const t = startTime + i * dt;
      const normalizedT = ((t - startTime) / period) * Math.PI + phaseRad;
      points.push({ x: t, y: Math.abs(amplitude * Math.sin(normalizedT)) });
    }
  } else if (type === 'damped') {
    const tau = Math.max(0.1, params.dampingTau ?? 2) * period;
    const samplesPerPeriod = 40;
    const totalSamples = Math.ceil(samplesPerPeriod * totalCycles);
    const dt = period / samplesPerPeriod;
    const phaseRad = (phaseShift * Math.PI) / 180;
    for (let i = 0; i <= totalSamples; i++) {
      const t = i * dt;
      const y = amplitude * Math.exp(-t / tau) * Math.sin((t / period) * 2 * Math.PI + phaseRad);
      points.push({ x: startTime + t, y });
    }
  }

  return offset !== 0 ? points.map(point => ({ x: point.x, y: point.y + offset })) : points;
}
