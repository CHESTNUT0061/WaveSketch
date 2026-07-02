export interface Point {
  x: number;
  y: number;
}

export interface LineSegment {
  id: string;
  start: Point;
  end: Point;
  control?: Point; // 贝塞尔曲线控制点
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
  xGridSize: number;      // 次格点（最小格点，用于吸附）
  yGridSize: number;
  xMajorGridSize: number; // 主格点（用于显示数字）
  yMajorGridSize: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zoom?: number;          // 缩放比例（默认1）
}

export type ToolMode = 'draw' | 'edit' | 'delete' | 'moveGroup' | 'select';
