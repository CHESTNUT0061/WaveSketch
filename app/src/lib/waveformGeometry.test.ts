import test from 'node:test';
import assert from 'node:assert/strict';
import type { LineSegment, WaveformGroup } from '../types/waveform.ts';
import { findSegmentHit, findWaveformHit, findWaveformHits, pointToQuadraticDistance, pointToSegmentDistance } from './waveformGeometry.ts';
import { groupsBottomToTop, reorderGroupList } from './waveformOrder.ts';

test('calculates line and quadratic distances', () => {
  assert.equal(pointToSegmentDistance({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 3);
  assert.ok(pointToQuadraticDistance({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 5, y: 10 }, { x: 10, y: 0 }) < 0.2);
});

test('returns every overlapping group in top-to-bottom order and deduplicates each group', () => {
  const groups: WaveformGroup[] = [
    { id: 'top', name: 'Top', color: '#f00', visible: true, segments: ['top-a', 'top-b'] },
    { id: 'bottom', name: 'Bottom', color: '#00f', visible: true, segments: ['bottom'] },
  ];
  const segments: LineSegment[] = [
    { id: 'bottom', groupId: 'bottom', type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
    { id: 'top-a', groupId: 'top', type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
    { id: 'top-b', groupId: 'top', type: 'line', start: { x: 0, y: 0.5 }, end: { x: 10, y: 0.5 } },
  ];
  const hits = findWaveformHits({ x: 5, y: 0 }, groups, segments, point => point, 1);
  assert.deepEqual(hits.map(hit => hit.groupName), ['Top', 'Bottom']);
  assert.equal(hits[0].segmentId, 'top-a');
  assert.equal(findWaveformHit({ x: 5, y: 0 }, groups, segments, point => point, 1)?.groupId, 'top');
});

test('selected-group segment targeting never falls through to another layer', () => {
  const groups: WaveformGroup[] = [
    { id: 'top', name: 'Top', color: '#f00', visible: true, segments: ['top'] },
    { id: 'bottom', name: 'Bottom', color: '#00f', visible: true, segments: ['bottom'] },
  ];
  const segments: LineSegment[] = [
    { id: 'top', groupId: 'top', type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
    { id: 'bottom', groupId: 'bottom', type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
  ];
  assert.equal(findSegmentHit({ x: 5, y: 0 }, groups, segments, point => point, 1, 'bottom')?.segmentId, 'bottom');
  assert.equal(findSegmentHit({ x: 5, y: 0 }, groups, segments, point => point, 1, 'missing'), null);
  assert.equal(findSegmentHit({ x: 5, y: 0 }, groups, segments, point => point, 1)?.segmentId, 'top');
});

test('reorders the list while preserving top-first and bottom-first render semantics', () => {
  const groups: WaveformGroup[] = [
    { id: 'a', name: 'A', color: '#f00', visible: true, segments: [] },
    { id: 'b', name: 'B', color: '#0f0', visible: true, segments: [] },
    { id: 'c', name: 'C', color: '#00f', visible: true, segments: [] },
  ];
  const reordered = reorderGroupList(groups, 'c', 'a');
  assert.deepEqual(reordered.map(group => group.id), ['c', 'a', 'b']);
  assert.deepEqual(groupsBottomToTop(reordered).map(group => group.id), ['b', 'a', 'c']);
  assert.equal(reorderGroupList(groups, 'missing', 'a'), groups);
});

test('hits curves and parametric sine while excluding hidden groups', () => {
  const groups: WaveformGroup[] = [
    { id: 'hidden', name: 'Hidden', color: '#f00', visible: false, segments: ['line'] },
    { id: 'curve', name: 'Curve', color: '#0f0', visible: true, segments: ['curve-segment'] },
    { id: 'sine', name: 'Sine', color: '#00f', visible: true, segments: [], parametric: { kind: 'sine', amplitude: 1, period: 4, totalCycles: 1, startTime: 0, phaseShift: 0, offset: 0 } },
  ];
  const segments: LineSegment[] = [
    { id: 'line', groupId: 'hidden', type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
    { id: 'curve-segment', groupId: 'curve', type: 'curve', start: { x: 0, y: 0 }, control: { x: 5, y: 10 }, end: { x: 10, y: 0 } },
  ];
  const curve = findWaveformHit({ x: 5, y: 5 }, groups, segments, point => point, 1);
  assert.equal(curve?.groupName, 'Curve');
  const sine = findWaveformHit({ x: 1, y: 1 }, [groups[2]], [], point => point, 0.1);
  assert.equal(sine?.groupName, 'Sine');
  const hidden = findWaveformHit({ x: 5, y: 0 }, [groups[0]], [segments[0]], point => point, 1);
  assert.equal(hidden, null);
});
