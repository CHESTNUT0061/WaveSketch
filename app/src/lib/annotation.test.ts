import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAnnotationRunStyle, clearAnnotationRunOverrides, estimateAnnotationLineWidth, getAnnotationBounds, getAnnotationIdsFullyInsideRect, getAnnotationRuns, renderSvgAnnotations, sanitizeAnnotations } from './annotation.ts';

test('annotation sanitizer rejects malformed positions and clamps font size', () => {
  assert.deepEqual(sanitizeAnnotations([{ id: 'bad', text: 'x', position: { x: 'no', y: 0 } }]), []);
  const [annotation] = sanitizeAnnotations([{ id: 'a', text: 'note', position: { x: 1, y: 2 }, fontSize: -1 }]);
  assert.equal(annotation.fontSize, 0.1);
});

test('SVG annotations remain native editable text and escape XML', () => {
  const [annotation] = sanitizeAnnotations([{ id: 'a', text: 'A < B & C', position: { x: 1, y: 2 } }]);
  const svg = renderSvgAnnotations([annotation], point => ({ x: point.x * 10, y: point.y * 10 }), 10);
  assert.match(svg, /<text /);
  assert.match(svg, /A &lt; B &amp; C<\/tspan><\/text>/);
  assert.doesNotMatch(svg, /<path/);
});

test('multiline annotations use editable SVG tspans and expand bounds', () => {
  const [annotation] = sanitizeAnnotations([{ id: 'a', text: 'top\nbottom', position: { x: 1, y: 2 } }]);
  const svg = renderSvgAnnotations([annotation], point => ({ x: point.x, y: point.y }), 10);
  assert.equal((svg.match(/<tspan /g) ?? []).length, 2);
  assert.match(svg, /dy="0\.00"/);
  assert.match(svg, /dy="4\.80"/);
  assert.ok(getAnnotationBounds(annotation).yMax > annotation.position.y + annotation.fontSize);
});

test('rich text runs preserve local color and superscript/subscript SVG styling', () => {
  const [annotation] = sanitizeAnnotations([{
    id: 'rich',
    text: 'Vcc2',
    position: { x: 1, y: 2 },
    runs: [
      { text: 'V', color: '#2563eb' },
      { text: 'cc', color: '#dc2626', verticalAlign: 'sub' },
      { text: '2', color: '#16a34a', verticalAlign: 'super' },
    ],
  }]);
  assert.equal(getAnnotationRuns(annotation).length, 3);
  const svg = renderSvgAnnotations([annotation], point => point, 10);
  assert.match(svg, /fill="#[0-9a-f]+"/);
  assert.match(svg, /baseline-shift="sub"/);
  assert.match(svg, /baseline-shift="super"/);
});

test('selection formatting splits and merges runs while preserving other local properties', () => {
  const [annotation] = sanitizeAnnotations([{
    id: 'selection',
    text: 'abcd',
    position: { x: 0, y: 0 },
    runs: [{ text: 'abcd', verticalAlign: 'super' }],
  }]);
  const colored = applyAnnotationRunStyle(annotation, 1, 3, { color: '#dc2626', fontFamily: 'Arial', fontSize: 0.8, fontWeight: 'bold', fontStyle: 'italic' });
  assert.deepEqual(colored, [
    { text: 'a', verticalAlign: 'super' },
    { text: 'bc', verticalAlign: 'super', color: '#dc2626', fontFamily: 'Arial', fontSize: 0.8, fontWeight: 'bold', fontStyle: 'italic' },
    { text: 'd', verticalAlign: 'super' },
  ]);
  const recolored = clearAnnotationRunOverrides(colored, ['color']);
  assert.equal(recolored?.map(run => run.text).join(''), annotation.text);
  assert.ok(recolored?.every(run => run.verticalAlign === 'super'));
  assert.equal(recolored?.some(run => run.color !== undefined), false);
});

test('rich SVG emits all supported character styles and keeps plain text inheritable', () => {
  const [annotation] = sanitizeAnnotations([{
    id: 'styles',
    text: 'AB',
    position: { x: 0, y: 0 },
    color: '#111827',
    runs: [
      { text: 'A' },
      { text: 'B', color: '#2563eb', fontFamily: 'Times New Roman', fontSize: 0.7, fontWeight: 'bold', fontStyle: 'italic', verticalAlign: 'sub' },
    ],
  }]);
  const svg = renderSvgAnnotations([annotation], point => point, 10);
  assert.match(svg, />A<\/tspan>/);
  assert.match(svg, /fill="#2563eb"/);
  assert.match(svg, /font-family="Times New Roman, sans-serif"/);
  assert.match(svg, /font-size="7\.00"/);
  assert.match(svg, /font-weight="bold"/);
  assert.match(svg, /font-style="italic"/);
  assert.match(svg, /baseline-shift="sub"/);
});

test('text alignment changes line layout without moving the annotation anchor', () => {
  const [annotation] = sanitizeAnnotations([{ id: 'a', text: 'center', position: { x: 0, y: 0 }, textAnchor: 'middle' }]);
  const bounds = getAnnotationBounds(annotation);
  assert.equal(bounds.xMin, 0);
  assert.ok(bounds.xMax > 0);
  const svg = renderSvgAnnotations([annotation], point => ({ x: point.x, y: point.y }), 10);
  assert.match(svg, /text-anchor="start" data-text-align="middle"/);
});

test('annotation width estimation accounts for full-width text', () => {
  assert.equal(estimateAnnotationLineWidth('AB', 10), 12.4);
  assert.equal(estimateAnnotationLineWidth('文字', 10), 20);
});

test('delete marquee targets only annotations fully inside its rectangle', () => {
  const annotations = sanitizeAnnotations([
    { id: 'inside', text: 'A', position: { x: 1, y: 1 }, fontSize: 0.4 },
    { id: 'crossing', text: 'long text', position: { x: 1.8, y: 1 }, fontSize: 0.4 },
    { id: 'outside', text: 'B', position: { x: 4, y: 4 }, fontSize: 0.4 },
  ]);
  assert.deepEqual(getAnnotationIdsFullyInsideRect(annotations, { x: 0, y: 0 }, { x: 2, y: 2 }), ['inside']);
  assert.deepEqual(getAnnotationIdsFullyInsideRect(annotations, { x: 2, y: 2 }, { x: 0, y: 0 }), ['inside']);
});
