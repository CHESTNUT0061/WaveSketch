import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWaveformPoints } from './waveformGeneration.ts';

const base = {
  amplitude: 2,
  period: 4,
  dutyCycle: 25,
  totalCycles: 2,
  startTime: 1,
  phaseShift: 90,
  offset: 3,
};

test('ramp rises across the full period and resets vertically', () => {
  assert.deepEqual(buildWaveformPoints('ramp', base), [
    { x: 2, y: 1 }, { x: 6, y: 5 }, { x: 6, y: 1 },
    { x: 6, y: 1 }, { x: 10, y: 5 }, { x: 10, y: 1 },
  ]);
});

test('ramp geometry is independent of duty cycle', () => {
  const lowDuty = buildWaveformPoints('ramp', { ...base, dutyCycle: 10 });
  const highDuty = buildWaveformPoints('ramp', { ...base, dutyCycle: 90 });
  assert.deepEqual(lowDuty, highDuty);
});
