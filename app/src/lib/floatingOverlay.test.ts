import test from 'node:test';
import assert from 'node:assert/strict';
import {
  constrainOverlayPosition,
  migrateLegacyOverlayPosition,
  serializeOverlayPosition,
} from './floatingOverlay.ts';

test('keeps a floating overlay inside all canvas edges', () => {
  const size = { width: 80, height: 40 };
  const bounds = { width: 300, height: 200 };
  assert.deepEqual(constrainOverlayPosition({ x: -30, y: -20 }, size, bounds), { x: 8, y: 8 });
  assert.deepEqual(constrainOverlayPosition({ x: 290, y: 190 }, size, bounds), { x: 212, y: 152 });
});

test('moves to the nearest legal position outside the inspector trigger', () => {
  const result = constrainOverlayPosition(
    { x: 250, y: 12 },
    { width: 48, height: 32 },
    { width: 390, height: 600 },
    { x: 300, y: 8, width: 70, height: 40 },
  );
  assert.deepEqual(result, { x: 244, y: 12 });
  assert.equal(result.x + 48, 300 - 8);
});

test('re-clamps an expanded overlay after its size changes', () => {
  const result = constrainOverlayPosition(
    { x: 320, y: 150 },
    { width: 240, height: 70 },
    { width: 390, height: 240 },
  );
  assert.deepEqual(result, { x: 142, y: 150 });
});

test('migrates legacy bottom-right offsets and preserves versioned positions', () => {
  assert.deepEqual(
    migrateLegacyOverlayPosition({ x: -20, y: -10 }, { width: 390, height: 600 }, { width: 48, height: 32 }),
    { x: 310, y: 546 },
  );
  const versioned = serializeOverlayPosition({ x: 42, y: 68 });
  assert.deepEqual(migrateLegacyOverlayPosition(versioned, { width: 1, height: 1 }, { width: 1, height: 1 }), { x: 42, y: 68 });
});
