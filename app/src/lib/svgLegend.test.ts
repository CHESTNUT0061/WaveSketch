import test from 'node:test';
import assert from 'node:assert/strict';
import type { WaveformGroup } from '../types/waveform.ts';
import { layoutSvgLegend, renderSvgLegend } from './svgLegend.ts';

test('keeps group order and wraps long legend rows', () => {
  const groups: WaveformGroup[] = [
    { id: 'a', name: 'A', color: '#f00', visible: true, segments: ['a'] },
    { id: 'b', name: '很长的中文波形名称', color: '#0f0', visible: true, segments: ['b'] },
    { id: 'c', name: 'C', color: '#00f', visible: true, segments: ['c'] },
  ];
  const layout = layoutSvgLegend(groups, 180);
  assert.deepEqual(layout.items.map(item => item.group.id), ['a', 'b', 'c']);
  assert.ok(layout.items[1].y > layout.items[0].y);
  assert.ok(layout.height >= 52);
});

test('renders escaped names and exact line styling', () => {
  const group: WaveformGroup = {
    id: 'gate-a', name: 'Gate <A&B>', color: '#123456', visible: true, segments: ['a'],
    lineWidth: 3, lineStyle: 'dashed', opacity: 0.6,
  };
  const svg = renderSvgLegend(layoutSvgLegend([group], 400), 60, 300);
  assert.match(svg, /id="legend"/);
  assert.match(svg, /Gate &lt;A&amp;B&gt;/);
  assert.match(svg, /stroke="#123456"/);
  assert.match(svg, /stroke-width="3"/);
  assert.match(svg, /stroke-dasharray="8,5"/);
  assert.match(svg, /stroke-opacity="0.6"/);
});

test('uses the shared default line width when a group has no explicit style', () => {
  const group: WaveformGroup = {
    id: 'default-width', name: 'Default', color: '#3b82f6', visible: true, segments: ['a'],
  };
  const svg = renderSvgLegend(layoutSvgLegend([group], 400), 60, 300);
  assert.match(svg, /stroke-width="3"/);
});
