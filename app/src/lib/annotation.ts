import type { Point, TextAnnotation } from '@/types/waveform';

export const DEFAULT_ANNOTATION_STYLE: Omit<TextAnnotation, 'id' | 'text' | 'position'> = {
  color: '#111827',
  fontSize: 0.4,
  fontFamily: 'Arial',
  fontWeight: 'normal',
  fontStyle: 'normal',
  textAnchor: 'start',
};

const FONT_FAMILIES = new Set(['Arial', 'Times New Roman', 'Courier New', 'Microsoft YaHei']);
const TEXT_ANCHORS = new Set(['start', 'middle', 'end']);

export const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function estimateAnnotationLineWidth(text: string, fontSize: number) {
  return Array.from(text).reduce((width, character) => {
    if (/\s/u.test(character)) return width + fontSize * 0.35;
    return width + fontSize * (character.codePointAt(0)! > 0xff ? 1 : 0.62);
  }, 0);
}

export function sanitizeAnnotations(value: unknown): TextAnnotation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): TextAnnotation[] => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Partial<TextAnnotation>;
    if (typeof candidate.id !== 'string' || typeof candidate.text !== 'string' ||
        !candidate.position || !Number.isFinite(candidate.position.x) || !Number.isFinite(candidate.position.y)) return [];
    return [{
      id: candidate.id,
      text: candidate.text,
      position: { x: candidate.position.x, y: candidate.position.y },
      color: typeof candidate.color === 'string' ? candidate.color : DEFAULT_ANNOTATION_STYLE.color,
      fontSize: Number.isFinite(candidate.fontSize) ? Math.max(0.1, candidate.fontSize as number) : DEFAULT_ANNOTATION_STYLE.fontSize,
      fontFamily: FONT_FAMILIES.has(candidate.fontFamily ?? '') ? candidate.fontFamily! : DEFAULT_ANNOTATION_STYLE.fontFamily,
      fontWeight: candidate.fontWeight === 'bold' ? 'bold' : 'normal',
      fontStyle: candidate.fontStyle === 'italic' ? 'italic' : 'normal',
      textAnchor: TEXT_ANCHORS.has(candidate.textAnchor ?? '') ? candidate.textAnchor! : 'start',
    }];
  });
}

export function getAnnotationBounds(annotation: TextAnnotation) {
  const lines = annotation.text.split('\n');
  const width = Math.max(annotation.fontSize, ...lines.map(line => estimateAnnotationLineWidth(line, annotation.fontSize)));
  return {
    xMin: annotation.position.x,
    xMax: annotation.position.x + width,
    yMin: annotation.position.y - annotation.fontSize * 0.25,
    yMax: annotation.position.y + annotation.fontSize * (1 + Math.max(0, lines.length - 1) * 1.2),
  };
}

export function getAnnotationIdsFullyInsideRect(
  annotations: TextAnnotation[],
  corner1: Point,
  corner2: Point,
) {
  const xLo = Math.min(corner1.x, corner2.x);
  const xHi = Math.max(corner1.x, corner2.x);
  const yLo = Math.min(corner1.y, corner2.y);
  const yHi = Math.max(corner1.y, corner2.y);
  return annotations
    .filter(annotation => {
      const bounds = getAnnotationBounds(annotation);
      return bounds.xMin >= xLo && bounds.xMax <= xHi && bounds.yMin >= yLo && bounds.yMax <= yHi;
    })
    .map(annotation => annotation.id);
}

export function renderSvgAnnotations(
  annotations: TextAnnotation[],
  worldToSvg: (point: Point) => Point,
  pxPerUnit: number,
) {
  if (annotations.length === 0) return '';
  let svg = '  <!-- 文字标注（保留为可编辑 SVG text） -->\n  <g id="annotations">\n';
  annotations.forEach((annotation, index) => {
    const point = worldToSvg(annotation.position);
    const fontPx = annotation.fontSize * pxPerUnit;
    const lineHeight = fontPx * 1.2;
    const lines = annotation.text.split('\n');
    const lineWidths = lines.map(line => estimateAnnotationLineWidth(line, fontPx));
    const maxWidth = Math.max(fontPx, ...lineWidths);
    const tspans = lines.map((line, lineIndex) => {
      const dy = lineIndex === 0 ? 0 : lineHeight;
      const offset = annotation.textAnchor === 'middle' ? (maxWidth - lineWidths[lineIndex]) / 2
        : annotation.textAnchor === 'end' ? maxWidth - lineWidths[lineIndex] : 0;
      return `<tspan x="${(point.x + offset).toFixed(2)}" dy="${dy.toFixed(2)}">${escapeXml(line)}</tspan>`;
    }).join('');
    svg += `    <text id="annotation-${index + 1}" x="${point.x.toFixed(2)}" y="${point.y.toFixed(2)}" fill="${escapeXml(annotation.color)}" font-family="${escapeXml(annotation.fontFamily)}, sans-serif" font-size="${fontPx.toFixed(2)}" font-weight="${annotation.fontWeight}" font-style="${annotation.fontStyle}" text-anchor="start" data-text-align="${annotation.textAnchor}" xml:space="preserve">${tspans}</text>\n`;
  });
  return `${svg}  </g>\n`;
}
