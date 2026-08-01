import type {
  CalcRpnToken,
  LineSegment,
  ParametricSine,
  Point,
  WaveformGroup,
} from '../types/waveform.ts';

const EPSILON = 1e-9;
const CURVE_SAMPLES = 32;

export interface ArithmeticWaveformResult {
  ok: boolean;
  points: Point[];
}

function quadraticPoint(segment: LineSegment, t: number): Point {
  const control = segment.control ?? segment.start;
  const inverse = 1 - t;
  return {
    x: inverse * inverse * segment.start.x + 2 * inverse * t * control.x + t * t * segment.end.x,
    y: inverse * inverse * segment.start.y + 2 * inverse * t * control.y + t * t * segment.end.y,
  };
}

function sampleParametricSine(sine: ParametricSine, samplesPerPeriod = 80): Point[] {
  const samples = Math.max(80, Math.ceil(sine.totalCycles * samplesPerPeriod));
  const totalTime = sine.period * sine.totalCycles;
  const phase = sine.phaseShift * Math.PI / 180;
  return Array.from({ length: samples + 1 }, (_, index) => {
    const elapsed = totalTime * index / samples;
    return {
      x: sine.startTime + elapsed,
      y: sine.offset + sine.amplitude * Math.sin(2 * Math.PI * elapsed / sine.period + phase),
    };
  });
}

function appendPoint(points: Point[], point: Point) {
  const previous = points[points.length - 1];
  if (previous && Math.abs(previous.x - point.x) <= EPSILON && Math.abs(previous.y - point.y) <= EPSILON) return;
  points.push({ ...point });
}

/**
 * Builds a stable, x-ordered trace for arithmetic evaluation. Segment ids are
 * read in group order so the before/after order of vertical edges is retained.
 */
export function buildArithmeticTrace(group: WaveformGroup, segments: LineSegment[]): Point[] {
  if (group.parametric?.kind === 'sine') return sampleParametricSine(group.parametric);

  const segmentMap = new Map(segments.map(segment => [segment.id, segment]));
  const pathPoints: Point[] = [];
  for (const segmentId of group.segments) {
    const segment = segmentMap.get(segmentId);
    if (!segment) continue;

    if (segment.type === 'curve' && segment.control) {
      for (let index = 0; index <= CURVE_SAMPLES; index++) {
        appendPoint(pathPoints, quadraticPoint(segment, index / CURVE_SAMPLES));
      }
    } else {
      appendPoint(pathPoints, segment.start);
      appendPoint(pathPoints, segment.end);
    }
  }

  // Modern JavaScript sorting is stable, so points that share x preserve the
  // path order (the first is the left limit and the last is the right limit).
  return pathPoints
    .map((point, order) => ({ point, order }))
    .sort((a, b) => a.point.x - b.point.x || a.order - b.order)
    .map(({ point }) => point);
}

/** Returns the selected one-sided value at x; a finite trace is zero outside its own range. */
export function evaluateTraceSide(
  x: number,
  points: Point[],
  side: 'left' | 'right',
  preserveOuterEndpoint = false,
): number {
  if (points.length === 0) return 0;

  let runStart = -1;
  let runEnd = -1;
  for (let index = 0; index < points.length; index++) {
    if (Math.abs(points[index].x - x) <= EPSILON) {
      if (runStart === -1) runStart = index;
      runEnd = index;
    } else if (points[index].x > x + EPSILON) {
      break;
    }
  }

  if (runStart !== -1) {
    const atStart = Math.abs(x - points[0].x) <= EPSILON;
    const atEnd = Math.abs(x - points[points.length - 1].x) <= EPSILON;
    if (!preserveOuterEndpoint && ((atStart && side === 'left') || (atEnd && side === 'right'))) return 0;
    return side === 'left' ? points[runStart].y : points[runEnd].y;
  }

  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    if (x <= start.x + EPSILON || x >= end.x - EPSILON) continue;
    const dx = end.x - start.x;
    if (dx <= EPSILON) continue;
    const ratio = (x - start.x) / dx;
    return start.y + ratio * (end.y - start.y);
  }

  return 0;
}

function mergeEventXs(traces: Map<string, Point[]>): number[] {
  const xs = Array.from(traces.values()).flatMap(points => points.map(point => point.x));
  xs.sort((a, b) => a - b);
  const merged: number[] = [];
  for (const x of xs) {
    if (merged.length === 0 || x - merged[merged.length - 1] > EPSILON) merged.push(x);
  }
  return merged;
}

function expressionHasWaveformMultiplication(rpn: CalcRpnToken[]): boolean {
  const stack: boolean[] = [];
  let hasWaveformMultiplication = false;
  for (const token of rpn) {
    if (token.t === 'g') stack.push(true);
    else if (token.t === 'c') stack.push(false);
    else {
      const right = stack.pop() ?? false;
      const left = stack.pop() ?? false;
      if (token.v === '×' && left && right) hasWaveformMultiplication = true;
      stack.push(left || right);
    }
  }
  return hasWaveformMultiplication;
}

function addMultiplicationSamples(eventXs: number[]): number[] {
  const samples: number[] = [];
  for (let index = 0; index < eventXs.length - 1; index++) {
    const start = eventXs[index];
    const interval = eventXs[index + 1] - start;
    samples.push(start, start + interval / 3, start + 2 * interval / 3);
  }
  samples.push(eventXs[eventXs.length - 1]);
  return samples;
}

function appendResultPoint(points: Point[], point: Point) {
  const previous = points[points.length - 1];
  if (previous && Math.abs(previous.x - point.x) <= EPSILON && Math.abs(previous.y - point.y) <= EPSILON) return;
  points.push(point);
}

/**
 * Evaluates arithmetic RPN over the union of all input event times. At a true
 * discontinuity it emits exactly two points with the same x, preserving a
 * vertical edge rather than connecting the two sides with a narrow diagonal.
 */
export function calculateArithmeticPoints(
  rpn: CalcRpnToken[],
  groups: WaveformGroup[],
  segments: LineSegment[],
): ArithmeticWaveformResult {
  if (rpn.length === 0) return { ok: false, points: [] };

  const groupMap = new Map(groups.map(group => [group.id, group]));
  const traces = new Map<string, Point[]>();
  for (const token of rpn) {
    if (token.t !== 'g' || traces.has(token.id)) continue;
    const group = groupMap.get(token.id);
    if (!group) return { ok: false, points: [] };
    const trace = buildArithmeticTrace(group, segments);
    if (trace.length < 2) return { ok: false, points: [] };
    traces.set(token.id, trace);
  }
  if (traces.size === 0) return { ok: false, points: [] };

  const eventXs = mergeEventXs(traces);
  if (eventXs.length < 2) return { ok: false, points: [] };
  const sampleXs = expressionHasWaveformMultiplication(rpn) ? addMultiplicationSamples(eventXs) : eventXs;
  const globalStart = eventXs[0];
  const globalEnd = eventXs[eventXs.length - 1];

  const evaluateExpression = (x: number, side: 'left' | 'right') => {
    const stack: number[] = [];
    for (const token of rpn) {
      if (token.t === 'g') {
        const preserveOuterEndpoint = side === 'left'
          ? Math.abs(x - globalStart) <= EPSILON
          : Math.abs(x - globalEnd) <= EPSILON;
        stack.push(evaluateTraceSide(x, traces.get(token.id)!, side, preserveOuterEndpoint));
      } else if (token.t === 'c') {
        stack.push(token.v);
      } else {
        const right = stack.pop() ?? 0;
        const left = stack.pop() ?? 0;
        stack.push(token.v === '+' ? left + right : token.v === '-' ? left - right : left * right);
      }
    }
    return stack[0] ?? 0;
  };

  const resultPoints: Point[] = [];
  for (const x of sampleXs) {
    const left = evaluateExpression(x, 'left');
    const right = evaluateExpression(x, 'right');
    if (Number.isFinite(left)) appendResultPoint(resultPoints, { x, y: left });
    if (Number.isFinite(right) && Math.abs(right - left) > EPSILON) {
      appendResultPoint(resultPoints, { x, y: right });
    }
  }

  return { ok: resultPoints.length >= 2, points: resultPoints };
}
