import test from 'node:test';
import assert from 'node:assert/strict';
import { isCollapsibleAxisViewport } from './responsiveLayout.ts';

test('makes phone and common Pad viewports collapsible', () => {
  assert.equal(isCollapsibleAxisViewport(390, 844, true), true);
  assert.equal(isCollapsibleAxisViewport(1024, 768, false), true);
  assert.equal(isCollapsibleAxisViewport(1366, 1024, true), true);
});

test('keeps an ordinary desktop pointer layout expanded', () => {
  assert.equal(isCollapsibleAxisViewport(1280, 720, false), false);
  assert.equal(isCollapsibleAxisViewport(1366, 768, false), false);
});
