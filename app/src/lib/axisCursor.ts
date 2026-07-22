import type { AxisConfig, AxisCursor, Point } from '../types/waveform.ts';

const escapeXml = (value: string) => value
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function nextCursorLabel(axis: AxisCursor['axis'], cursors: AxisCursor[]): string {
  const prefix = axis.toUpperCase();
  const used = new Set(cursors
    .filter(cursor => cursor.axis === axis)
    .map(cursor => Number(cursor.label.match(new RegExp(`^${prefix}(\\d+)$`))?.[1]))
    .filter(Number.isFinite));
  let index = 1;
  while (used.has(index)) index++;
  return `${prefix}${index}`;
}

export function snapCursorValue(value: number, axis: AxisCursor['axis'], config: AxisConfig): number {
  const step = axis === 'x' ? config.xGridSize : config.yGridSize;
  return Math.round(value / step) * step;
}

export function findAxisCursorHit(
  point: Point,
  cursors: AxisCursor[],
  worldToScreen: (point: Point) => Point,
  threshold = 8,
): AxisCursor | null {
  let best: { cursor: AxisCursor; distance: number } | null = null;
  // Later cursors are painted later and win exact ties.
  for (let index = cursors.length - 1; index >= 0; index--) {
    const cursor = cursors[index];
    if (!cursor.visible) continue;
    const screen = cursor.axis === 'x'
      ? worldToScreen({ x: cursor.value, y: 0 })
      : worldToScreen({ x: 0, y: cursor.value });
    const distance = cursor.axis === 'x' ? Math.abs(point.x - screen.x) : Math.abs(point.y - screen.y);
    if (distance <= threshold && (!best || distance < best.distance)) best = { cursor, distance };
  }
  return best?.cursor ?? null;
}

export function sanitizeAxisCursors(value: unknown): AxisCursor[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const raw = item as Partial<AxisCursor>;
    if (typeof raw.id !== 'string' || ids.has(raw.id) || (raw.axis !== 'x' && raw.axis !== 'y') ||
        typeof raw.value !== 'number' || !Number.isFinite(raw.value) || typeof raw.label !== 'string') return [];
    ids.add(raw.id);
    return [{ id: raw.id, axis: raw.axis, value: raw.value, label: raw.label, visible: raw.visible !== false }];
  });
}

export interface SvgCursorRenderOptions {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  padding: number;
  width: number;
  plotHeight: number;
  axisConfig: AxisConfig;
  worldToSvg: (point: Point) => Point;
}

export const cursorValueText = (cursor: AxisCursor, config: AxisConfig) => {
  const unit = cursor.axis === 'x' ? config.xUnit : config.yUnit;
  return `${cursor.label} = ${Number(cursor.value.toFixed(6))}${unit ? ` ${unit}` : ''}`;
};

export function renderSvgCursors(cursors: AxisCursor[], options: SvgCursorRenderOptions): string {
  const visible = cursors.filter(cursor => cursor.visible && (
    cursor.axis === 'x'
      ? cursor.value >= options.xMin && cursor.value <= options.xMax
      : cursor.value >= options.yMin && cursor.value <= options.yMax
  ));
  if (visible.length === 0) return '';
  let svg = '  <!-- Cursor 游标 -->\n  <g id="cursors">\n';
  for (const cursor of visible) {
    const screen = options.worldToSvg(cursor.axis === 'x' ? { x: cursor.value, y: 0 } : { x: 0, y: cursor.value });
    const text = escapeXml(cursorValueText(cursor, options.axisConfig));
    svg += `    <g id="cursor-${escapeXml(cursor.id)}">\n      <title>${text}</title>\n`;
    if (cursor.axis === 'x') {
      const labelX = Math.max(options.padding + 3, Math.min(options.width - options.padding - 110, screen.x + 4));
      svg += `      <line x1="${screen.x.toFixed(2)}" y1="${options.padding}" x2="${screen.x.toFixed(2)}" y2="${options.plotHeight - options.padding}" stroke="#000000" stroke-width="1" stroke-dasharray="6,4"/>\n`;
      svg += `      <text x="${labelX.toFixed(2)}" y="${(options.padding + 14).toFixed(2)}" font-family="sans-serif" font-size="11" fill="#000000">${text}</text>\n`;
    } else {
      const labelY = Math.max(options.padding + 12, Math.min(options.plotHeight - options.padding - 4, screen.y - 4));
      svg += `      <line x1="${options.padding}" y1="${screen.y.toFixed(2)}" x2="${options.width - options.padding}" y2="${screen.y.toFixed(2)}" stroke="#000000" stroke-width="1" stroke-dasharray="6,4"/>\n`;
      svg += `      <text x="${(options.padding + 4).toFixed(2)}" y="${labelY.toFixed(2)}" font-family="sans-serif" font-size="11" fill="#000000">${text}</text>\n`;
    }
    svg += '    </g>\n';
  }
  return `${svg}  </g>\n`;
}
