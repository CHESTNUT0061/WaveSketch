import test from 'node:test';
import assert from 'node:assert/strict';
import type { LineSegment, LogicRpnToken, Point, WaveformGroup } from '../types/waveform.ts';
import { analyzeDigitalWaveform, calculateLogicPoints } from './digitalLogic.ts';

function waveform(id: string, points: Point[]): { group: WaveformGroup; segments: LineSegment[] } {
  const segments = points.slice(0, -1).map((start, index) => ({
    id: `${id}-${index}`,
    start,
    end: points[index + 1],
    type: 'line' as const,
    groupId: id,
  }));
  return { group: { id, name: id, color: '#000', visible: true, segments: segments.map(segment => segment.id) }, segments };
}

const valueBetween = (points: Point[], x: number) => {
  for (let index = 0; index < points.length - 1; index++) {
    if (points[index].x <= x && x <= points[index + 1].x && points[index].x !== points[index + 1].x) return points[index].y;
  }
  return points.at(-1)?.y ?? 0;
};

test('accepts generated and offset two-level square waveforms', () => {
  const square = waveform('A', [{ x: 0, y: -2 }, { x: 0, y: 4 }, { x: 1, y: 4 }, { x: 1, y: -2 }, { x: 2, y: -2 }]);
  assert.deepEqual(analyzeDigitalWaveform(square.group, square.segments), {
    eligible: true, low: -2, high: 4, startX: 0, endX: 2,
    points: [{ x: 0, y: -2 }, { x: 0, y: 4 }, { x: 1, y: 4 }, { x: 1, y: -2 }, { x: 2, y: -2 }],
  });
});

test('rejects curve, diagonal, three-level, disconnected, and parametric waveforms', () => {
  const base = waveform('A', [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 0 }]);
  assert.equal(analyzeDigitalWaveform(base.group, [{ ...base.segments[0], type: 'curve', control: { x: 0.2, y: 0.4 } }, ...base.segments.slice(1)]).issue, 'curve');
  assert.equal(analyzeDigitalWaveform(base.group, [{ ...base.segments[0], end: { x: 0.5, y: 1 } }, ...base.segments.slice(1)]).issue, 'diagonal');
  const three = waveform('T', [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }]);
  assert.equal(analyzeDigitalWaveform(three.group, three.segments).issue, 'levels');
  assert.equal(analyzeDigitalWaveform(base.group, [base.segments[0], { ...base.segments[1], start: { x: 0.2, y: 1 } }, ...base.segments.slice(2)]).issue, 'disconnected');
  assert.equal(analyzeDigitalWaveform({ ...base.group, parametric: { kind: 'sine', amplitude: 1, period: 1, totalCycles: 1, startTime: 0, phaseShift: 0, offset: 0 } }, base.segments).issue, 'parametric');
});

test('evaluates NOT, AND, OR and nested expressions at exact transition events', () => {
  const a = waveform('A', [{ x: 0, y: 0 }, { x: 0, y: 5 }, { x: 2, y: 5 }, { x: 2, y: 0 }, { x: 4, y: 0 }]);
  const b = waveform('B', [{ x: 1, y: -1 }, { x: 1, y: 3 }, { x: 3, y: 3 }, { x: 3, y: -1 }, { x: 5, y: -1 }]);
  const c = waveform('C', [{ x: 0, y: 0 }, { x: 2.5, y: 0 }, { x: 2.5, y: 1 }, { x: 4.5, y: 1 }, { x: 4.5, y: 0 }, { x: 5, y: 0 }]);
  const groups = [a.group, b.group, c.group];
  const segments = [...a.segments, ...b.segments, ...c.segments];
  const calc = (rpn: LogicRpnToken[]) => calculateLogicPoints(rpn, groups, segments).points;

  const notA = calc([{ t: 'g', id: 'A' }, { t: 'op', v: 'NOT' }]);
  assert.equal(valueBetween(notA, 1), 0);
  assert.equal(valueBetween(notA, 3), 5);
  const and = calc([{ t: 'g', id: 'A' }, { t: 'g', id: 'B' }, { t: 'op', v: 'AND' }]);
  assert.equal(valueBetween(and, 0.5), 0);
  assert.equal(valueBetween(and, 1.5), 5);
  assert.equal(valueBetween(and, 2.5), 0);
  const or = calc([{ t: 'g', id: 'A' }, { t: 'g', id: 'B' }, { t: 'op', v: 'OR' }]);
  assert.equal(valueBetween(or, 0.5), 5);
  assert.equal(valueBetween(or, 2.5), 5);
  assert.equal(valueBetween(or, 4.5), 0);
  const nested = calc([
    { t: 'g', id: 'A' }, { t: 'op', v: 'NOT' },
    { t: 'g', id: 'B' }, { t: 'g', id: 'C' }, { t: 'op', v: 'OR' },
    { t: 'op', v: 'AND' },
  ]);
  assert.equal(valueBetween(nested, 1.5), 0);
  assert.equal(valueBetween(nested, 3.5), 5);

  const result = waveform('R', nested);
  assert.equal(analyzeDigitalWaveform(result.group, result.segments).eligible, true);
});

test('inherits the first referenced waveform levels while evaluating every input as booleans', () => {
  const reference = waveform('OFFSET', [
    { x: 0, y: -2 }, { x: 0, y: 4 }, { x: 2, y: 4 }, { x: 2, y: -2 }, { x: 4, y: -2 },
  ]);
  const other = waveform('UNIT', [
    { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 0 }, { x: 5, y: 0 },
  ]);
  const groups = [reference.group, other.group];
  const segments = [...reference.segments, ...other.segments];

  const not = calculateLogicPoints(
    [{ t: 'g', id: 'OFFSET' }, { t: 'op', v: 'NOT' }],
    groups,
    segments,
  );
  assert.equal(not.ok, true);
  assert.deepEqual([...new Set(not.points.map(point => point.y))].sort((a, b) => a - b), [-2, 4]);
  assert.equal(valueBetween(not.points, 1), -2);
  assert.equal(valueBetween(not.points, 3), 4);

  const and = calculateLogicPoints(
    [{ t: 'g', id: 'OFFSET' }, { t: 'g', id: 'UNIT' }, { t: 'op', v: 'AND' }],
    groups,
    segments,
  );
  assert.equal(and.ok, true);
  assert.deepEqual([...new Set(and.points.map(point => point.y))].sort((a, b) => a - b), [-2, 4]);
  assert.equal(valueBetween(and.points, 1.5), 4);
  assert.equal(valueBetween(and.points, 2.5), -2);

  const chained = waveform('CHAINED', and.points);
  assert.deepEqual(analyzeDigitalWaveform(chained.group, chained.segments), {
    eligible: true,
    low: -2,
    high: 4,
    startX: 0,
    endX: 5,
    points: and.points,
  });
});
