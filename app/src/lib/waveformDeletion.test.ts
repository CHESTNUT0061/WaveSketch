import test from 'node:test';
import assert from 'node:assert/strict';
import type { LineSegment, WaveformGroup } from '../types/waveform.ts';
import { deleteSegmentsAndEmptyGroups } from './waveformDeletion.ts';

const segments: LineSegment[] = [
  { id: 'a1', groupId: 'a', type: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
  { id: 'b1', groupId: 'b', type: 'line', start: { x: 0, y: 1 }, end: { x: 1, y: 1 } },
  { id: 'b2', groupId: 'b', type: 'line', start: { x: 1, y: 1 }, end: { x: 2, y: 1 } },
];
const groups: WaveformGroup[] = [
  { id: 'empty', name: 'Manual empty', color: '#999', visible: true, segments: [] },
  { id: 'a', name: 'A', color: '#f00', visible: true, segments: ['a1'] },
  { id: 'b', name: 'B', color: '#0f0', visible: true, segments: ['b1', 'b2'] },
  { id: 'sine', name: 'Sine', color: '#00f', visible: true, segments: [], parametric: { kind: 'sine', amplitude: 1, period: 2, totalCycles: 1, startTime: 0, phaseShift: 0, offset: 0 } },
];

test('removes only groups made empty by this deletion', () => {
  const result = deleteSegmentsAndEmptyGroups(segments, groups, new Set(['a1', 'b1']));
  assert.deepEqual(result.removedGroupIds, ['a']);
  assert.deepEqual(result.groups.map(group => group.id), ['empty', 'b', 'sine']);
  assert.deepEqual(result.groups.find(group => group.id === 'b')?.segments, ['b2']);
});

test('batch deletion removes every affected empty ordinary group but preserves parametric groups', () => {
  const result = deleteSegmentsAndEmptyGroups(segments, groups, new Set(['a1', 'b1', 'b2']));
  assert.deepEqual(result.removedGroupIds, ['a', 'b']);
  assert.ok(result.groups.some(group => group.id === 'empty'));
  assert.ok(result.groups.some(group => group.id === 'sine'));
});

test('uses actual remaining geometry when a legacy group segment list is stale', () => {
  const staleGroups = groups.map(group => group.id === 'a' ? { ...group, segments: ['a1'] } : group);
  const withExtra: LineSegment[] = [...segments, { id: 'a2', groupId: 'a', type: 'line', start: { x: 1, y: 0 }, end: { x: 2, y: 0 } }];
  const result = deleteSegmentsAndEmptyGroups(withExtra, staleGroups, new Set(['a1']));
  assert.ok(result.groups.some(group => group.id === 'a'));
  assert.ok(result.segments.some(segment => segment.id === 'a2'));
});
