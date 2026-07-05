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
}

// 无限画布视口：世界坐标中心 + 缩放（像素/世界单位）
export interface Viewport {
  centerX: number;
  centerY: number;
  scale: number;
}

// 波形计算器 RPN（逆波兰）token：g=波形组引用，c=常数，op=二元运算符
export type CalcRpnToken =
  | { t: 'g'; id: string }
  | { t: 'c'; v: number }
  | { t: 'op'; v: '+' | '-' | '×' };

export type ToolMode = 'draw' | 'edit' | 'delete' | 'moveGroup' | 'select';
