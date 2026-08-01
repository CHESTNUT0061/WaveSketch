import test from 'node:test';
import assert from 'node:assert/strict';
import { isProductionCounterHost, parseCounterText } from './siteCounter.ts';

test('loads counters only on the official GitHub Pages hostname', () => {
  assert.equal(isProductionCounterHost('CHESTNUT0061.github.io'), true);
  assert.equal(isProductionCounterHost('127.0.0.1'), false);
  assert.equal(isProductionCounterHost('localhost'), false);
  assert.equal(isProductionCounterHost('preview.example.com'), false);
});

test('parses formatted counters and rejects missing values', () => {
  assert.equal(parseCounterText('12,345'), 12345);
  assert.equal(parseCounterText(' 2 034 '), 2034);
  assert.equal(parseCounterText(''), null);
  assert.equal(parseCounterText(undefined), null);
});
