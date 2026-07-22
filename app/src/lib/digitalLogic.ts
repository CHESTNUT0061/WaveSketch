import type {
  DigitalWaveformAnalysis,
  LineSegment,
  LogicRpnToken,
  Point,
  WaveformGroup,
} from '../types/waveform.ts';

const EPS = 1e-9;

const same = (a: number, b: number) => Math.abs(a - b) <= EPS;
const samePoint = (a: Point, b: Point) => same(a.x, b.x) && same(a.y, b.y);

function uniqueLevels(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.filter((value, index) => index === 0 || !same(value, sorted[index - 1]));
}

export function analyzeDigitalWaveform(
  group: WaveformGroup,
  allSegments: LineSegment[],
): DigitalWaveformAnalysis {
  if (group.parametric) return { eligible: false, issue: 'parametric' };

  const byId = new Map(allSegments.map(segment => [segment.id, segment]));
  const segments = group.segments.map(id => byId.get(id)).filter((segment): segment is LineSegment => !!segment);
  if (segments.length === 0 || segments.length !== group.segments.length) {
    return { eligible: false, issue: 'empty' };
  }

  const levels: number[] = [];
  let hasHorizontalLowDuration = false;
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    if (segment.type !== 'line' || segment.control) return { eligible: false, issue: 'curve' };
    const dx = segment.end.x - segment.start.x;
    const dy = segment.end.y - segment.start.y;
    if (!same(dx, 0) && !same(dy, 0)) return { eligible: false, issue: 'diagonal' };
    if (same(dx, 0) && same(dy, 0)) return { eligible: false, issue: 'disconnected' };
    if (dx < -EPS) return { eligible: false, issue: 'time' };
    if (index > 0 && !samePoint(segments[index - 1].end, segment.start)) {
      return { eligible: false, issue: 'disconnected' };
    }
    if (!same(dx, 0)) hasHorizontalLowDuration = true;
    levels.push(segment.start.y, segment.end.y);
  }

  const unique = uniqueLevels(levels);
  if (unique.length !== 2 || !hasHorizontalLowDuration) return { eligible: false, issue: 'levels' };
  const startX = segments[0].start.x;
  const endX = segments[segments.length - 1].end.x;
  if (!(endX - startX > EPS)) return { eligible: false, issue: 'time' };

  return {
    eligible: true,
    low: unique[0],
    high: unique[1],
    startX,
    endX,
    points: [segments[0].start, ...segments.map(segment => segment.end)],
  };
}

function stateAt(analysis: DigitalWaveformAnalysis, x: number, side: 'left' | 'right'): boolean {
  const points = analysis.points ?? [];
  const startX = analysis.startX ?? 0;
  const endX = analysis.endX ?? 0;
  const high = analysis.high ?? 1;
  if (x < startX - EPS || x > endX + EPS || points.length === 0) return false;
  if (same(x, startX) && side === 'left') return false;
  if (same(x, endX) && side === 'right') return false;

  let first = -1;
  let last = -1;
  for (let index = 0; index < points.length; index++) {
    if (same(points[index].x, x)) {
      if (first < 0) first = index;
      last = index;
    } else if (points[index].x > x + EPS) break;
  }
  if (first >= 0) return same((side === 'left' ? points[first] : points[last]).y, high);

  for (let index = 0; index < points.length - 1; index++) {
    if (points[index].x < x && x < points[index + 1].x) return same(points[index].y, high);
  }
  return false;
}

export interface LogicCalculationResult {
  ok: boolean;
  points: Point[];
  invalidGroupId?: string;
}

export function calculateLogicPoints(
  rpn: LogicRpnToken[],
  groups: WaveformGroup[],
  segments: LineSegment[],
): LogicCalculationResult {
  const analyses = new Map<string, DigitalWaveformAnalysis>();
  const eventXs: number[] = [];
  for (const token of rpn) {
    if (token.t !== 'g' || analyses.has(token.id)) continue;
    const group = groups.find(item => item.id === token.id);
    if (!group) return { ok: false, points: [], invalidGroupId: token.id };
    const analysis = analyzeDigitalWaveform(group, segments);
    if (!analysis.eligible) return { ok: false, points: [], invalidGroupId: token.id };
    analyses.set(token.id, analysis);
    analysis.points?.forEach(point => eventXs.push(point.x));
  }
  if (analyses.size === 0) return { ok: false, points: [] };

  // Logic is evaluated as booleans, while the rendered result inherits the
  // low/high levels of the first waveform referenced by the expression.
  const referenceToken = rpn.find((token): token is Extract<LogicRpnToken, { t: 'g' }> => token.t === 'g');
  const reference = referenceToken ? analyses.get(referenceToken.id) : undefined;
  if (!reference?.eligible || reference.low === undefined || reference.high === undefined) {
    return { ok: false, points: [] };
  }

  const xs = [...eventXs].sort((a, b) => a - b).filter((x, index, array) => index === 0 || !same(x, array[index - 1]));
  const evaluate = (x: number, side: 'left' | 'right'): boolean | null => {
    const stack: boolean[] = [];
    for (const token of rpn) {
      if (token.t === 'g') {
        stack.push(stateAt(analyses.get(token.id)!, x, side));
      } else if (token.v === 'NOT') {
        const value = stack.pop();
        if (value === undefined) return null;
        stack.push(!value);
      } else {
        const right = stack.pop();
        const left = stack.pop();
        if (left === undefined || right === undefined) return null;
        stack.push(token.v === 'AND' ? left && right : left || right);
      }
    }
    return stack.length === 1 ? stack[0] : null;
  };

  const points: Point[] = [];
  for (const x of xs) {
    const left = evaluate(x, 'left');
    const right = evaluate(x, 'right');
    if (left === null || right === null) return { ok: false, points: [] };
    points.push({ x, y: left ? reference.high : reference.low });
    if (left !== right) points.push({ x, y: right ? reference.high : reference.low });
  }
  return { ok: points.length >= 2, points };
}
