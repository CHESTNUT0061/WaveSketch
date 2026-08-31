import type { AnnotationRunStyle, AnnotationTextRun, AnnotationVerticalAlign, Point, TextAnnotation } from '@/types/waveform';

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
const VERTICAL_ALIGNS = new Set(['baseline', 'super', 'sub']);

export const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export const ANNOTATION_CHARACTER_STYLE_KEYS = ['color', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'verticalAlign'] as const;
export type AnnotationCharacterStyleKey = typeof ANNOTATION_CHARACTER_STYLE_KEYS[number];

const sameRunStyle = (left: AnnotationTextRun, right: AnnotationTextRun) => (
  ANNOTATION_CHARACTER_STYLE_KEYS.every(key => left[key] === right[key])
);

export function mergeAnnotationRuns(runs: AnnotationTextRun[]): AnnotationTextRun[] {
  return runs.reduce<AnnotationTextRun[]>((merged, run) => {
    if (!run.text) return merged;
    const last = merged.at(-1);
    if (last && sameRunStyle(last, run)) last.text += run.text;
    else merged.push({ ...run });
    return merged;
  }, []);
}

export function getAnnotationRuns(annotation: TextAnnotation): AnnotationTextRun[] {
  const runs = annotation.runs?.filter(run => run.text.length > 0);
  if (runs && runs.length > 0 && runs.map(run => run.text).join('') === annotation.text) return mergeAnnotationRuns(runs);
  return annotation.text ? [{ text: annotation.text }] : [];
}

export function applyAnnotationRunStyle(
  annotation: TextAnnotation,
  start: number,
  end: number,
  patch: AnnotationRunStyle,
) {
  const from = Math.max(0, Math.min(start, end, annotation.text.length));
  const to = Math.max(from, Math.min(Math.max(start, end), annotation.text.length));
  if (from === to) return getAnnotationRuns(annotation);
  let offset = 0;
  const next: AnnotationTextRun[] = [];
  getAnnotationRuns(annotation).forEach(run => {
    const runStart = offset;
    const runEnd = offset + run.text.length;
    const overlapStart = Math.max(runStart, from);
    const overlapEnd = Math.min(runEnd, to);
    if (runStart < overlapStart) next.push({ ...run, text: run.text.slice(0, overlapStart - runStart) });
    if (overlapStart < overlapEnd) {
      const styled: AnnotationTextRun = { ...run, ...patch, text: run.text.slice(overlapStart - runStart, overlapEnd - runStart) };
      ANNOTATION_CHARACTER_STYLE_KEYS.forEach(key => {
        if (Object.prototype.hasOwnProperty.call(patch, key) && patch[key] === undefined) delete styled[key];
      });
      next.push(styled);
    }
    if (overlapEnd < runEnd) next.push({ ...run, text: run.text.slice(overlapEnd - runStart) });
    offset = runEnd;
  });
  return mergeAnnotationRuns(next);
}

export function clearAnnotationRunOverrides(
  runs: AnnotationTextRun[] | undefined,
  keys: readonly AnnotationCharacterStyleKey[],
) {
  if (!runs) return undefined;
  const next = runs.map(run => {
    const cleaned = { ...run };
    keys.forEach(key => delete cleaned[key]);
    return cleaned;
  });
  const merged = mergeAnnotationRuns(next);
  return merged.some(run => ANNOTATION_CHARACTER_STYLE_KEYS.some(key => run[key] !== undefined)) ? merged : undefined;
}

function sanitizeTextRuns(value: unknown, text: string): AnnotationTextRun[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const runs = value.flatMap((item): AnnotationTextRun[] => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Partial<AnnotationTextRun>;
    if (typeof candidate.text !== 'string' || candidate.text.length === 0) return [];
    return [{
      text: candidate.text,
      ...(typeof candidate.color === 'string' ? { color: candidate.color } : {}),
      ...(FONT_FAMILIES.has(candidate.fontFamily ?? '') ? { fontFamily: candidate.fontFamily } : {}),
      ...(Number.isFinite(candidate.fontSize) ? { fontSize: Math.max(0.1, candidate.fontSize as number) } : {}),
      ...(candidate.fontWeight === 'bold' || candidate.fontWeight === 'normal' ? { fontWeight: candidate.fontWeight } : {}),
      ...(candidate.fontStyle === 'italic' || candidate.fontStyle === 'normal' ? { fontStyle: candidate.fontStyle } : {}),
      ...(VERTICAL_ALIGNS.has(candidate.verticalAlign ?? '') ? { verticalAlign: candidate.verticalAlign as AnnotationVerticalAlign } : {}),
    }];
  });
  if (runs.length === 0 || runs.map(run => run.text).join('') !== text) return undefined;
  const merged = mergeAnnotationRuns(runs);
  return merged.some(run => ANNOTATION_CHARACTER_STYLE_KEYS.some(key => run[key] !== undefined)) ? merged : undefined;
}

export function estimateAnnotationLineWidth(text: string, fontSize: number) {
  return Array.from(text).reduce((width, character) => {
    if (/\s/u.test(character)) return width + fontSize * 0.35;
    return width + fontSize * (character.codePointAt(0)! > 0xff ? 1 : 0.62);
  }, 0);
}

export function getEffectiveAnnotationRunStyle(annotation: TextAnnotation, run: AnnotationTextRun) {
  const verticalAlign = run.verticalAlign ?? 'baseline';
  const baseFontSize = run.fontSize ?? annotation.fontSize;
  return {
    color: run.color ?? annotation.color,
    fontFamily: run.fontFamily ?? annotation.fontFamily,
    fontSize: baseFontSize * (verticalAlign === 'baseline' ? 1 : 0.7),
    sourceFontSize: baseFontSize,
    fontWeight: run.fontWeight ?? annotation.fontWeight,
    fontStyle: run.fontStyle ?? annotation.fontStyle,
    verticalAlign,
  };
}

function splitAnnotationRunsIntoLines(annotation: TextAnnotation) {
  const lines: AnnotationTextRun[][] = [];
  let currentLine: AnnotationTextRun[] = [];
  getAnnotationRuns(annotation).forEach(run => {
    const parts = run.text.split('\n');
    parts.forEach((part, partIndex) => {
      if (part.length > 0) currentLine.push({ ...run, text: part });
      if (partIndex < parts.length - 1) {
        lines.push(currentLine);
        currentLine = [];
      }
    });
  });
  lines.push(currentLine);
  return lines;
}

export function sanitizeAnnotations(value: unknown): TextAnnotation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): TextAnnotation[] => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Partial<TextAnnotation>;
    if (typeof candidate.id !== 'string' || typeof candidate.text !== 'string' ||
        !candidate.position || !Number.isFinite(candidate.position.x) || !Number.isFinite(candidate.position.y)) return [];
    const color = typeof candidate.color === 'string' ? candidate.color : DEFAULT_ANNOTATION_STYLE.color;
    return [{
      id: candidate.id,
      text: candidate.text,
      position: { x: candidate.position.x, y: candidate.position.y },
      color,
      fontSize: Number.isFinite(candidate.fontSize) ? Math.max(0.1, candidate.fontSize as number) : DEFAULT_ANNOTATION_STYLE.fontSize,
      fontFamily: FONT_FAMILIES.has(candidate.fontFamily ?? '') ? candidate.fontFamily! : DEFAULT_ANNOTATION_STYLE.fontFamily,
      fontWeight: candidate.fontWeight === 'bold' ? 'bold' : 'normal',
      fontStyle: candidate.fontStyle === 'italic' ? 'italic' : 'normal',
      textAnchor: TEXT_ANCHORS.has(candidate.textAnchor ?? '') ? candidate.textAnchor! : 'start',
      runs: sanitizeTextRuns((candidate as { runs?: unknown }).runs, candidate.text),
    }];
  });
}

export function getAnnotationBounds(annotation: TextAnnotation) {
  const lines = splitAnnotationRunsIntoLines(annotation);
  const widths = lines.map(line => line.reduce((width, run) => (
    width + estimateAnnotationLineWidth(run.text, getEffectiveAnnotationRunStyle(annotation, run).fontSize)
  ), 0));
  const heights = lines.map(line => Math.max(annotation.fontSize, ...line.map(run => getEffectiveAnnotationRunStyle(annotation, run).fontSize)));
  const width = Math.max(annotation.fontSize, ...widths);
  const totalHeight = heights.reduce((height, lineHeight) => height + lineHeight * 1.2, 0);
  return {
    xMin: annotation.position.x,
    xMax: annotation.position.x + width,
    yMin: annotation.position.y - Math.max(annotation.fontSize, heights[0] ?? annotation.fontSize) * 0.25,
    yMax: annotation.position.y + Math.max(annotation.fontSize, totalHeight - (heights[0] ?? annotation.fontSize) * 0.2),
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
    const lines = annotation.text.split('\n');
    const runLines = splitAnnotationRunsIntoLines(annotation);
    const lineWidths = runLines.map(line => line.reduce((width, run) => (
      width + estimateAnnotationLineWidth(run.text, getEffectiveAnnotationRunStyle(annotation, run).fontSize * pxPerUnit)
    ), 0));
    const lineHeights = runLines.map(line => Math.max(fontPx, ...line.map(run => getEffectiveAnnotationRunStyle(annotation, run).fontSize * pxPerUnit)));
    const maxWidth = Math.max(fontPx, ...lineWidths);
    const hasRichRuns = Array.isArray(annotation.runs) && annotation.runs.length > 0;
    const tspans = lines.map((line, lineIndex) => {
      const dy = lineIndex === 0 ? 0 : lineHeights[lineIndex - 1] * 1.2;
      const offset = annotation.textAnchor === 'middle' ? (maxWidth - lineWidths[lineIndex]) / 2
        : annotation.textAnchor === 'end' ? maxWidth - lineWidths[lineIndex] : 0;
      if (!hasRichRuns) return `<tspan x="${(point.x + offset).toFixed(2)}" dy="${dy.toFixed(2)}">${escapeXml(line)}</tspan>`;
      const children = (runLines[lineIndex] ?? [{ text: line }]).map(run => {
        const attributes = [
          run.color ? `fill="${escapeXml(run.color)}"` : '',
          run.fontFamily ? `font-family="${escapeXml(run.fontFamily)}, sans-serif"` : '',
          run.fontSize ? `font-size="${(run.fontSize * pxPerUnit).toFixed(2)}"` : '',
          run.fontWeight ? `font-weight="${run.fontWeight}"` : '',
          run.fontStyle ? `font-style="${run.fontStyle}"` : '',
          run.verticalAlign === 'super' || run.verticalAlign === 'sub' ? `baseline-shift="${run.verticalAlign}"` : '',
          (run.verticalAlign === 'super' || run.verticalAlign === 'sub') && !run.fontSize ? 'font-size="70%"' : '',
        ].filter(Boolean).join(' ');
        return `<tspan${attributes ? ` ${attributes}` : ''}>${escapeXml(run.text)}</tspan>`;
      }).join('');
      return `<tspan x="${(point.x + offset).toFixed(2)}" dy="${dy.toFixed(2)}">${children}</tspan>`;
    }).join('');
    svg += `    <text id="annotation-${index + 1}" x="${point.x.toFixed(2)}" y="${point.y.toFixed(2)}" fill="${escapeXml(annotation.color)}" font-family="${escapeXml(annotation.fontFamily)}, sans-serif" font-size="${fontPx.toFixed(2)}" font-weight="${annotation.fontWeight}" font-style="${annotation.fontStyle}" text-anchor="start" data-text-align="${annotation.textAnchor}" xml:space="preserve">${tspans}</text>\n`;
  });
  return `${svg}  </g>\n`;
}
