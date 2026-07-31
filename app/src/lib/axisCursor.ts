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

export interface CursorLabelBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface CursorLabelLayout {
  text: string;
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  textX: number;
  textY: number;
}

const fitCursorText = (text: string, maxWidth: number, measureText: (value: string) => number): string => {
  if (maxWidth <= 0) return '';
  if (measureText(text) <= maxWidth) return text;
  const ellipsis = '…';
  if (measureText(ellipsis) > maxWidth) return '';
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (measureText(`${text.slice(0, middle)}${ellipsis}`) <= maxWidth) low = middle;
    else high = middle - 1;
  }
  return `${text.slice(0, low)}${ellipsis}`;
};

export function layoutCursorLabel(
  text: string,
  axis: AxisCursor['axis'],
  position: number,
  bounds: CursorLabelBounds,
  measureText: (value: string) => number,
): CursorLabelLayout {
  const margin = 2;
  const paddingX = 4;
  const boxHeight = Math.max(1, Math.min(18, bounds.bottom - bounds.top - margin * 2));
  const maxBoxWidth = Math.max(1, bounds.right - bounds.left - margin * 2);
  const fittedText = fitCursorText(text, Math.max(0, maxBoxWidth - paddingX * 2), measureText);
  const boxWidth = Math.max(1, Math.min(maxBoxWidth, measureText(fittedText) + paddingX * 2));
  const minX = bounds.left + margin;
  const maxX = Math.max(minX, bounds.right - margin - boxWidth);
  const minY = bounds.top + margin;
  const maxY = Math.max(minY, bounds.bottom - margin - boxHeight);
  const preferredX = axis === 'x' ? position + 4 : bounds.left + 4;
  const preferredY = axis === 'x' ? bounds.top + 4 : position - boxHeight - 3;
  const boxX = Math.max(minX, Math.min(maxX, preferredX));
  const boxY = Math.max(minY, Math.min(maxY, preferredY));
  return {
    text: fittedText,
    boxX,
    boxY,
    boxWidth,
    boxHeight,
    textX: boxX + paddingX,
    textY: boxY + 3,
  };
}

const estimateSvgTextWidth = (value: string) => Array.from(value).reduce(
  (width, char) => width + ((char.codePointAt(0) ?? 0) > 0xff ? 11 : 6.2),
  0,
);

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
    const fullText = cursorValueText(cursor, options.axisConfig);
    const layout = layoutCursorLabel(fullText, cursor.axis, cursor.axis === 'x' ? screen.x : screen.y, {
      left: options.padding,
      top: options.padding,
      right: options.width - options.padding,
      bottom: options.plotHeight - options.padding,
    }, estimateSvgTextWidth);
    const text = escapeXml(layout.text);
    svg += `    <g id="cursor-${escapeXml(cursor.id)}">\n      <title>${escapeXml(fullText)}</title>\n`;
    if (cursor.axis === 'x') {
      svg += `      <line x1="${screen.x.toFixed(2)}" y1="${options.padding}" x2="${screen.x.toFixed(2)}" y2="${options.plotHeight - options.padding}" stroke="#000000" stroke-width="1" stroke-dasharray="6,4"/>\n`;
    } else {
      svg += `      <line x1="${options.padding}" y1="${screen.y.toFixed(2)}" x2="${options.width - options.padding}" y2="${screen.y.toFixed(2)}" stroke="#000000" stroke-width="1" stroke-dasharray="6,4"/>\n`;
    }
    svg += `      <rect x="${layout.boxX.toFixed(2)}" y="${layout.boxY.toFixed(2)}" width="${layout.boxWidth.toFixed(2)}" height="${layout.boxHeight.toFixed(2)}" fill="#ffffff" stroke="#000000" stroke-opacity="0.35"/>\n`;
    svg += `      <text x="${layout.textX.toFixed(2)}" y="${(layout.textY + 9).toFixed(2)}" font-family="sans-serif" font-size="11" fill="#000000">${text}</text>\n`;
    svg += '    </g>\n';
  }
  return `${svg}  </g>\n`;
}
