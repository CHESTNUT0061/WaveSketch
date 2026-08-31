import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateAnnotationLineWidth, getAnnotationBounds, getAnnotationIdsFullyInsideRect, renderSvgAnnotations, sanitizeAnnotations } from './annotation.ts';

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
