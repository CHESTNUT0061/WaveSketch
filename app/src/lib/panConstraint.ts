export type PanConstraint = 'any' | 'vertical';
export type PanAxis = 'x' | 'y' | null;

export function constrainPanAxis(dx: number, dy: number, axis: PanAxis): { dx: number; dy: number } {
  if (axis === 'x') return { dx, dy: 0 };
  if (axis === 'y') return { dx: 0, dy };
  return { dx, dy };
}

export function constrainPanDelta(dx: number, dy: number, constraint: PanConstraint): { dx: number; dy: number } {
  if (constraint === 'vertical') {
    if (Math.abs(dx) >= Math.abs(dy)) return { dx, dy: 0 };
    return { dx: 0, dy };
  }
  return { dx, dy };
}
