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

export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface WaveformGroup {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  segments: string[]; // segment ids
  // Optional per-group rendering style (defaults: width 2, solid, opacity 1)
  lineWidth?: number;
  lineStyle?: LineStyle;
  opacity?: number; // 0..1
}

// Dash patterns shared by the canvas renderer and the SVG export
export const LINE_DASH: Record<LineStyle, number[]> = {
  solid: [],
  dashed: [8, 5],
  dotted: [2, 4],
};

export interface AxisConfig {
  xUnit: string;
  yUnit: string;
  xGridSize: number;      // minor grid (snap unit)
  yGridSize: number;
  xMajorGridSize: number; // major grid (numbered ticks)
  yMajorGridSize: number;
}

// Infinite-canvas viewport: world-space center + per-axis scale (px per world unit).
// scaleX and scaleY are independent so the X and Y axes can be zoomed separately.
export interface Viewport {
  centerX: number;
  centerY: number;
  scaleX: number;
  scaleY: number;
}

export type ZoomAxis = 'x' | 'y' | 'both';

// Calculator RPN token: g = waveform group ref, c = constant, op = binary operator
export type CalcRpnToken =
  | { t: 'g'; id: string }
  | { t: 'c'; v: number }
  | { t: 'op'; v: '+' | '-' | '×' };

export type ToolMode = 'draw' | 'edit' | 'delete' | 'moveGroup' | 'select' | 'pan';
