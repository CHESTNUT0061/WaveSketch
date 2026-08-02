import test from 'node:test';
import assert from 'node:assert/strict';
import type { CalcRpnToken, LineSegment, Point, WaveformGroup } from '../types/waveform.ts';
import { buildWaveformPoints } from './waveformGeneration.ts';
import { buildArithmeticTrace, calculateArithmeticPoints } from './waveformArithmetic.ts';

function makeGroup(id: string, points: Point[]): { group: WaveformGroup; segments: LineSegment[] } {
  const segments: LineSegment[] = [];
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    if (start.x === end.x && start.y === end.y) continue;
    segments.push({ id: `${id}-${index}`, groupId: id, type: 'line', start, end });
  }
  return {
    group: { id, name: id, color: '#000000', visible: true, segments: segments.map(segment => segment.id) },
    segments,
  };
}

function ramp(id: string, startTime: number, totalCycles = 2) {
  return makeGroup(id, buildWaveformPoints('ramp', {
    amplitude: 1,
    period: 2,
    dutyCycle: 50,
    totalCycles,
    startTime,
    phaseShift: 0,
    offset: 0,
  }));
}

function calculate(
  rpn: CalcRpnToken[],
  inputs: Array<{ group: WaveformGroup; segments: LineSegment[] }>,
) {
  return calculateArithmeticPoints(
    rpn,
    inputs.map(input => input.group),
    inputs.flatMap(input => input.segments),
  );
}

test('ramp plus zero preserves every vertical reset, including the final boundary', () => {
  const a = ramp('a', 0);
  const result = calculate([
    { t: 'g', id: 'a' },
    { t: 'c', v: 0 },
    { t: 'op', v: '+' },
  ], [a]);

  assert.equal(result.ok, true);
  assert.deepEqual(result.points, [
    { x: 0, y: -1 },
    { x: 2, y: 1 }, { x: 2, y: -1 },
    { x: 4, y: 1 }, { x: 4, y: -1 },
  ]);
});

test('two in-phase ramps double amplitude without creating sliver edges', () => {
  const a = ramp('a', 0);
  const b = ramp('b', 0);
  const result = calculate([
    { t: 'g', id: 'a' }, { t: 'g', id: 'b' }, { t: 'op', v: '+' },
  ], [a, b]);

  assert.deepEqual(result.points, [
    { x: 0, y: -2 },
    { x: 2, y: 2 }, { x: 2, y: -2 },
    { x: 4, y: 2 }, { x: 4, y: -2 },
  ]);
});

test('phase-shifted ramps use the union of exact events and keep all jumps vertical', () => {
  const a = ramp('a', 0);
  const b = ramp('b', 0.5);
  const result = calculate([
    { t: 'g', id: 'a' }, { t: 'g', id: 'b' }, { t: 'op', v: '+' },
  ], [a, b]);

  assert.equal(result.ok, true);
  const eventXs = new Set([0, 0.5, 2, 2.5, 4, 4.5]);
  for (let index = 0; index < result.points.length - 1; index++) {
    const start = result.points[index];
    const end = result.points[index + 1];
    if (start.x === end.x) {
      assert.equal(eventXs.has(start.x), true);
    } else {
      const slope = Math.abs((end.y - start.y) / (end.x - start.x));
      assert.ok(slope <= 2 + 1e-9, `non-vertical segment exceeds the two-ramp slope: ${JSON.stringify({ start, end })}`);
    }
  }
  assert.equal(result.points.every(point => point.y >= -2 && point.y <= 2), true);
});

test('a shorter waveform enters and leaves as zero with exact vertical transitions', () => {
  const a = ramp('a', 0, 3);
  const b = ramp('b', 1, 1);
  const result = calculate([
    { t: 'g', id: 'a' }, { t: 'g', id: 'b' }, { t: 'op', v: '+' },
  ], [a, b]);

  const atStart = result.points.filter(point => point.x === 1).map(point => point.y);
  const atEnd = result.points.filter(point => point.x === 3).map(point => point.y);
  assert.deepEqual(atStart, [0, -1]);
  assert.deepEqual(atEnd, [1, 0]);
});

test('quadratic curves are sampled on the curve rather than through the control point', () => {
  const segment: LineSegment = {
    id: 'curve-0',
    groupId: 'curve',
    type: 'curve',
    start: { x: 0, y: 0 },
    control: { x: 1, y: 2 },
    end: { x: 2, y: 0 },
  };
  const group: WaveformGroup = {
    id: 'curve', name: 'curve', color: '#000000', visible: true, segments: [segment.id],
  };

  const trace = buildArithmeticTrace(group, [segment]);
  const midpoint = trace.find(point => point.x === 1);
  assert.deepEqual(midpoint, { x: 1, y: 1 });
});

test('rejects malformed arithmetic RPN instead of treating missing operands as zero', () => {
  const a = ramp('a', 0, 1);

  assert.deepEqual(calculate([
    { t: 'op', v: '+' },
  ], [a]), { ok: false, points: [] });

  assert.deepEqual(calculate([
    { t: 'g', id: 'a' }, { t: 'g', id: 'a' },
  ], [a]), { ok: false, points: [] });
});

test('removes floating-point noise from a balanced six-phase triangle sum', () => {
  const inputs = Array.from({ length: 6 }, (_, index) => {
    const id = `triangle-${index}`;
    return makeGroup(id, buildWaveformPoints('triangle', {
      amplitude: 1,
      period: 2,
      dutyCycle: 50,
      totalCycles: 2,
      startTime: 0,
      phaseShift: index * 60,
      offset: 0,
    }));
  });
  const rpn: CalcRpnToken[] = [];
  for (const input of inputs) {
    rpn.push({ t: 'g', id: input.group.id });
    if (rpn.length > 1) rpn.push({ t: 'op', v: '+' });
  }

  const result = calculate(rpn, inputs);
  assert.equal(result.ok, true);
  assert.equal(result.points.some(point => Math.abs(point.y) > 1e-9), true);
  assert.equal(result.points.some(point => point.y === 0), true);
  assert.equal(result.points.every(point => Number.isFinite(point.y)), true);
});
