import test from 'node:test';
import assert from 'node:assert/strict';
import type { AxisConfig, AxisCursor } from '../types/waveform.ts';
import { findAxisCursorHit, nextCursorLabel, renderSvgCursors, sanitizeAxisCursors, snapCursorValue } from './axisCursor.ts';

const config: AxisConfig = { xUnit: 't', yUnit: 'A', xGridSize: 0.5, yGridSize: 0.25, xMajorGridSize: 2, yMajorGridSize: 1 };
const cursors: AxisCursor[] = [
  { id: 'x1', axis: 'x', value: 2, label: 'X1', visible: true },
  { id: 'y1', axis: 'y', value: 1, label: 'Y1', visible: true },
];

test('numbers cursors independently and fills gaps', () => {
  assert.equal(nextCursorLabel('x', cursors), 'X2');
  assert.equal(nextCursorLabel('y', [...cursors, { id: 'y3', axis: 'y', value: 0, label: 'Y3', visible: true }]), 'Y2');
});

test('hits visible cursor lines and snaps on the selected axis', () => {
  const transform = (point: { x: number; y: number }) => ({ x: point.x * 10, y: point.y * 20 });
  assert.equal(findAxisCursorHit({ x: 22, y: 100 }, cursors, transform, 3)?.id, 'x1');
  assert.equal(findAxisCursorHit({ x: 100, y: 19 }, cursors, transform, 3)?.id, 'y1');
  assert.equal(snapCursorValue(1.26, 'x', config), 1.5);
  assert.equal(snapCursorValue(1.13, 'y', config), 1.25);
});

test('sanitizes cursor data and renders only in-range visible cursors', () => {
  assert.deepEqual(sanitizeAxisCursors(undefined), []);
  const sanitized = sanitizeAxisCursors([...cursors, { id: 'bad', axis: 'z', value: 1, label: 'bad' }, { id: 'x1', axis: 'x', value: 3, label: 'duplicate' }]);
  assert.deepEqual(sanitized.map(cursor => cursor.id), ['x1', 'y1']);
  const svg = renderSvgCursors([...cursors, { id: 'hidden', axis: 'y', value: 0, label: 'Y<2', visible: false }, { id: 'outside', axis: 'x', value: 20, label: 'X9', visible: true }], {
    xMin: 0, xMax: 10, yMin: -2, yMax: 2, padding: 60, width: 520, plotHeight: 320, axisConfig: config,
    worldToSvg: point => ({ x: 60 + point.x * 40, y: 220 - point.y * 40 }),
  });
  assert.match(svg, /id="cursors"/);
  assert.match(svg, /stroke-width="1"/);
  assert.match(svg, /stroke-dasharray="6,4"/);
  assert.match(svg, /X1 = 2 t/);
  assert.match(svg, /Y1 = 1 A/);
  assert.doesNotMatch(svg, /Y&lt;2/);
  assert.doesNotMatch(svg, /X9/);
});
