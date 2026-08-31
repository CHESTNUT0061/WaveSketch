import test from 'node:test';
import assert from 'node:assert/strict';
import { MIN_GRID_SIZE, normalizeAxisConfig } from './axisConfig.ts';

test('grid sizes never fall below the 0.001 lower bound', () => {
  const config = normalizeAxisConfig({
    xGridSize: -1,
    yGridSize: 0,
    xMajorGridSize: -0.5,
    yMajorGridSize: 0.0001,
  });
  assert.equal(config.xGridSize, MIN_GRID_SIZE);
  assert.equal(config.yGridSize, MIN_GRID_SIZE);
  assert.equal(config.xMajorGridSize, MIN_GRID_SIZE);
  assert.equal(config.yMajorGridSize, MIN_GRID_SIZE);
});

test('valid grid sizes and units are preserved', () => {
  const config = normalizeAxisConfig({ xUnit: 'ns', yUnit: 'V', xGridSize: 0.25, yMajorGridSize: 4 });
  assert.equal(config.xUnit, 'ns');
  assert.equal(config.yUnit, 'V');
  assert.equal(config.xGridSize, 0.25);
  assert.equal(config.yMajorGridSize, 4);
});
