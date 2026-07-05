export interface Point {
  x: number;
  y: number;
}

export interface LineSegment {
  id: string;
  start: Point;
  end: Point;
  control?: Point; // Bezier control point
  type: 'line' | 'curve';
  groupId?: string;
}

export interface WaveformGroup {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  segments: string[]; // segment ids
}

export interface AxisConfig {
  xUnit: string;
  yUnit: string;
  xGridSize: number;      // minor grid (snap unit)
  yGridSize: number;
  xMajorGridSize: number; // major grid (numbered ticks)
  yMajorGridSize: number;
}

// Infinite-canvas viewport: world-space center + scale (px per world unit)
export interface Viewport {
  centerX: number;
  centerY: number;
  scale: number;
}

// Calculator RPN token: g = waveform group ref, c = constant, op = binary operator
export type CalcRpnToken =
  | { t: 'g'; id: string }
  | { t: 'c'; v: number }
  | { t: 'op'; v: '+' | '-' | '×' };

export type ToolMode = 'draw' | 'edit' | 'delete' | 'moveGroup' | 'select' | 'pan';
