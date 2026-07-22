import { DEFAULT_LINE_WIDTH, LINE_DASH, type WaveformGroup } from '../types/waveform.ts';

export interface LegendItemLayout {
  group: WaveformGroup;
  x: number;
  y: number;
  width: number;
}

export interface LegendLayout {
  items: LegendItemLayout[];
  height: number;
}

function estimatedTextWidth(text: string, fontSize: number): number {
  return [...text].reduce((width, char) => width + ((char.codePointAt(0) ?? 0) > 0xff ? fontSize : fontSize * 0.62), 0);
}

export function layoutSvgLegend(groups: WaveformGroup[], availableWidth: number, fontSize = 13): LegendLayout {
  const rowHeight = 26;
  const sampleWidth = 34;
  const gap = 20;
  const items: LegendItemLayout[] = [];
  let x = 0;
  let row = 0;
  for (const group of groups) {
    const width = sampleWidth + 10 + estimatedTextWidth(group.name, fontSize) + gap;
    if (x > 0 && x + width > availableWidth) {
      row++;
      x = 0;
    }
    items.push({ group, x, y: row * rowHeight, width });
    x += width;
  }
  return { items, height: items.length === 0 ? 0 : (row + 1) * rowHeight };
}

const escapeXml = (value: string) => value
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function renderSvgLegend(layout: LegendLayout, padding: number, plotHeight: number): string {
  if (layout.items.length === 0) return '';
  const legendTop = plotHeight + 12;
  let svg = `  <!-- 图例 -->\n  <g id="legend">\n`;
  layout.items.forEach(item => {
    const group = item.group;
    const dash = LINE_DASH[group.lineStyle ?? 'solid'];
    const dashAttr = dash.length ? ` stroke-dasharray="${dash.join(',')}"` : '';
    const opacity = group.opacity ?? 1;
    const opacityAttr = opacity < 1 ? ` stroke-opacity="${opacity}"` : '';
    const y = legendTop + item.y + 13;
    const x = padding + item.x;
    svg += `    <g id="legend-item-${escapeXml(group.id)}">\n`;
    svg += `      <line x1="${x.toFixed(2)}" y1="${y.toFixed(2)}" x2="${(x + 34).toFixed(2)}" y2="${y.toFixed(2)}" stroke="${group.color}" stroke-width="${group.lineWidth ?? DEFAULT_LINE_WIDTH}"${dashAttr}${opacityAttr}/>\n`;
    svg += `      <text font-family="sans-serif" font-size="13" fill="#1f2937" x="${(x + 44).toFixed(2)}" y="${(y + 4).toFixed(2)}">${escapeXml(group.name)}</text>\n`;
    svg += `    </g>\n`;
  });
  return `${svg}  </g>\n`;
}
