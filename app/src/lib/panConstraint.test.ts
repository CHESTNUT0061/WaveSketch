import test from 'node:test';
import assert from 'node:assert/strict';
import { constrainPanAxis, constrainPanDelta } from './panConstraint.ts';

test('keeps free pan unchanged and axis-aligned pan chooses the dominant axis', () => {
  assert.deepEqual(constrainPanDelta(3, 4, 'any'), { dx: 3, dy: 4 });
  assert.deepEqual(constrainPanDelta(3, 4, 'vertical'), { dx: 0, dy: 4 });
  assert.deepEqual(constrainPanDelta(4, 3, 'vertical'), { dx: 4, dy: 0 });
});

test('shift axis lock keeps only the selected axis', () => {
  assert.deepEqual(constrainPanAxis(12, 8, 'x'), { dx: 12, dy: 0 });
  assert.deepEqual(constrainPanAxis(12, 8, 'y'), { dx: 0, dy: 8 });
  assert.deepEqual(constrainPanAxis(12, 8, null), { dx: 12, dy: 8 });
});
