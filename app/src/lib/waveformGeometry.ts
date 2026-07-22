import type { LineSegment, ParametricSine, Point, WaveformGroup } from '../types/waveform.ts';

export interface WaveformHit {
  segmentId?: string;
  groupId?: string;
  groupName: string;
  color: string;
  distance: number;
}

const UNGROUPED_KEY = '__wavesketch_ungrouped__';

export function pointToSegmentDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

export function quadraticPoint(start: Point, control: Point, end: Point, t: number): Point {
  const inv = 1 - t;
  return {
    x: inv * inv * start.x + 2 * inv * t * control.x + t * t * end.x,
    y: inv * inv * start.y + 2 * inv * t * control.y + t * t * end.y,
  };
}

export function pointToQuadraticDistance(point: Point, start: Point, control: Point, end: Point, samples = 48): number {
  let distance = Infinity;
  let previous = start;
  for (let index = 1; index <= samples; index++) {
    const current = quadraticPoint(start, control, end, index / samples);
    distance = Math.min(distance, pointToSegmentDistance(point, previous, current));
    previous = current;
  }
  return distance;
}

export function sampleParametricSine(sine: ParametricSine, samplesPerCycle = 80): Point[] {
  const samples = Math.max(80, Math.ceil(sine.totalCycles * samplesPerCycle));
  return Array.from({ length: samples + 1 }, (_, index) => {
    const elapsed = sine.period * sine.totalCycles * index / samples;
    return {
      x: sine.startTime + elapsed,
      y: sine.offset + sine.amplitude * Math.sin(2 * Math.PI * elapsed / sine.period + sine.phaseShift * Math.PI / 180),
    };
  });
}

export function findWaveformHits(
  point: Point,
  groups: WaveformGroup[],
  segments: LineSegment[],
  worldToScreen: (point: Point) => Point,
  threshold = 8,
): WaveformHit[] {
  const groupById = new Map(groups.map(group => [group.id, group]));
  const bestByGroup = new Map<string, WaveformHit>();
  const consider = (hit: WaveformHit) => {
    if (hit.distance > threshold) return;
    const key = hit.groupId ?? UNGROUPED_KEY;
    const current = bestByGroup.get(key);
    if (!current || hit.distance < current.distance) bestByGroup.set(key, hit);
  };

  for (const segment of segments) {
    const group = segment.groupId ? groupById.get(segment.groupId) : undefined;
    if (group && !group.visible) continue;
    const start = worldToScreen(segment.start);
    const end = worldToScreen(segment.end);
    const distance = segment.type === 'curve' && segment.control
      ? pointToQuadraticDistance(point, start, worldToScreen(segment.control), end)
      : pointToSegmentDistance(point, start, end);
    consider({
      segmentId: segment.id,
      groupId: group?.id,
      groupName: group?.name ?? 'Ungrouped',
      color: group?.color ?? '#3b82f6',
      distance,
    });
  }

  for (const group of groups) {
    if (!group.visible || group.segments.length > 0 || group.parametric?.kind !== 'sine') continue;
    const points = sampleParametricSine(group.parametric).map(worldToScreen);
    let distance = Infinity;
    for (let index = 0; index < points.length - 1; index++) {
      distance = Math.min(distance, pointToSegmentDistance(point, points[index], points[index + 1]));
    }
    consider({ groupId: group.id, groupName: group.name, color: group.color, distance });
  }

  // groups[0] is the top layer. Map insertion order above must not leak into
  // hover or tie-breaking, so explicitly return hits in layer order.
  const ordered: WaveformHit[] = [];
  for (const group of groups) {
    const hit = bestByGroup.get(group.id);
    if (hit) ordered.push(hit);
  }
  const ungrouped = bestByGroup.get(UNGROUPED_KEY);
  if (ungrouped) ordered.push(ungrouped);
  return ordered;
}

export function findWaveformHit(
  point: Point,
  groups: WaveformGroup[],
  segments: LineSegment[],
  worldToScreen: (point: Point) => Point,
  threshold = 8,
): WaveformHit | null {
  const hits = findWaveformHits(point, groups, segments, worldToScreen, threshold);
  return hits.reduce<WaveformHit | null>((closest, hit) => {
    // Hits are already top-to-bottom, so equal distances retain the top layer.
    return !closest || hit.distance < closest.distance ? hit : closest;
  }, null);
}

export function findSegmentHit(
  point: Point,
  groups: WaveformGroup[],
  segments: LineSegment[],
  worldToScreen: (point: Point) => Point,
  threshold = 8,
  onlyGroupId?: string | null,
): WaveformHit | null {
  const hits = findWaveformHits(point, groups, segments, worldToScreen, threshold)
    .filter(hit => hit.segmentId && (!onlyGroupId || hit.groupId === onlyGroupId));
  return hits.reduce<WaveformHit | null>((closest, hit) => {
    return !closest || hit.distance < closest.distance ? hit : closest;
  }, null);
}
