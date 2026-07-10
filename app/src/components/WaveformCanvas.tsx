import React, { useEffect, useCallback } from 'react';
import type { Point, LineSegment, WaveformGroup, AxisConfig, ZoomAxis } from '@/types/waveform';
import { LINE_DASH } from '@/types/waveform';

interface WaveformCanvasProps {
  segments: LineSegment[];
  groups: WaveformGroup[];
  selectedSegments: Set<string>;
  axisConfig: AxisConfig;
  mode: 'draw' | 'edit' | 'delete' | 'moveGroup' | 'select' | 'pan';
  selectedGroup: string | null;
  activeSegment: string | null;
  isDrawing: boolean;
  drawStart: Point | null;
  currentMouse: Point | null;
  draggingControl: string | null;
  copyingSegments?: LineSegment[]; // segments being copied (for preview)
  copyOffset?: Point; // copy offset
  worldToScreen: (point: Point, canvas: HTMLCanvasElement) => Point;
  screenToWorld: (point: Point, canvas: HTMLCanvasElement) => Point;
  snapToGrid: (point: Point) => Point;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: (e: React.MouseEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
  onZoomChange?: (factor: number, screenPos?: Point, axis?: ZoomAxis) => void;
  onPan?: (dxCss: number, dyCss: number) => void; // pan by a screen-pixel delta (two-finger gesture)
  panning?: 'ready' | 'active' | null; // ready = space held, active = dragging
  selectionRect?: { start: Point; end: Point } | null; // rubber-band rect in world coords
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export const WaveformCanvas: React.FC<WaveformCanvasProps> = ({
  segments,
  groups,
  selectedSegments,
  axisConfig,
  mode,
  selectedGroup,
  activeSegment,
  isDrawing,
  drawStart,
  currentMouse,
  copyingSegments = [],
  copyOffset = { x: 0, y: 0 },
  worldToScreen,
  screenToWorld,
  snapToGrid,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onDoubleClick,
  onZoomChange,
  onPan,
  panning = null,
  selectionRect = null,
  canvasRef,
}) => {
  const drawGrid = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    // All drawing coordinates are CSS pixels (the context is pre-scaled by devicePixelRatio)
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;

    // Visible world range of the current viewport (infinite canvas: grid fills the whole area)
    const topLeft = screenToWorld({ x: 0, y: 0 }, canvas);
    const bottomRight = screenToWorld({ x: cssW, y: cssH }, canvas);
    const xMinVis = topLeft.x;
    const xMaxVis = bottomRight.x;
    const yMinVis = bottomRight.y;
    const yMaxVis = topLeft.y;

    // Pixels per world unit, per axis (used for density control)
    const originPx = worldToScreen({ x: 0, y: 0 }, canvas);
    const pxPerUnitX = worldToScreen({ x: 1, y: 0 }, canvas).x - originPx.x;
    const pxPerUnitY = originPx.y - worldToScreen({ x: 0, y: 1 }, canvas).y;

    const isMajor = (v: number, major: number) =>
      Math.abs(v / major - Math.round(v / major)) < 1e-6;

    // Minor grid (light gray) - skipped when the spacing drops below 5px
    if (axisConfig.xGridSize * pxPerUnitX >= 5 && axisConfig.yGridSize * pxPerUnitY >= 5) {
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);

      // Vertical minor lines (integer-index loop avoids float accumulation error)
      for (let i = Math.ceil(xMinVis / axisConfig.xGridSize); i * axisConfig.xGridSize <= xMaxVis; i++) {
        const x = i * axisConfig.xGridSize;
        if (isMajor(x, axisConfig.xMajorGridSize)) continue;
        const screenX = worldToScreen({ x, y: 0 }, canvas).x;
        ctx.beginPath();
        ctx.moveTo(screenX, 0);
        ctx.lineTo(screenX, cssH);
        ctx.stroke();
      }

      // Horizontal minor lines
      for (let i = Math.ceil(yMinVis / axisConfig.yGridSize); i * axisConfig.yGridSize <= yMaxVis; i++) {
        const y = i * axisConfig.yGridSize;
        if (isMajor(y, axisConfig.yMajorGridSize)) continue;
        const screenY = worldToScreen({ x: 0, y }, canvas).y;
        ctx.beginPath();
        ctx.moveTo(0, screenY);
        ctx.lineTo(cssW, screenY);
        ctx.stroke();
      }
    }

    // Major grid (dark gray) - skipped when the spacing drops below 12px
    const showMajor = axisConfig.xMajorGridSize * pxPerUnitX >= 12 && axisConfig.yMajorGridSize * pxPerUnitY >= 12;
    if (showMajor) {
      ctx.strokeStyle = '#6b7280';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);

      for (let i = Math.ceil(xMinVis / axisConfig.xMajorGridSize); i * axisConfig.xMajorGridSize <= xMaxVis; i++) {
        const screenX = worldToScreen({ x: i * axisConfig.xMajorGridSize, y: 0 }, canvas).x;
        ctx.beginPath();
        ctx.moveTo(screenX, 0);
        ctx.lineTo(screenX, cssH);
        ctx.stroke();
      }

      for (let i = Math.ceil(yMinVis / axisConfig.yMajorGridSize); i * axisConfig.yMajorGridSize <= yMaxVis; i++) {
        const screenY = worldToScreen({ x: 0, y: i * axisConfig.yMajorGridSize }, canvas).y;
        ctx.beginPath();
        ctx.moveTo(0, screenY);
        ctx.lineTo(cssW, screenY);
        ctx.stroke();
      }
    }

    // Axes (thick black) - drawn only when the origin is in view
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;

    const origin = worldToScreen({ x: 0, y: 0 }, canvas);
    const xAxisVisible = origin.y >= 0 && origin.y <= cssH;
    const yAxisVisible = origin.x >= 0 && origin.x <= cssW;

    if (xAxisVisible) {
      ctx.beginPath();
      ctx.moveTo(0, origin.y);
      ctx.lineTo(cssW, origin.y);
      ctx.stroke();
    }
    if (yAxisVisible) {
      ctx.beginPath();
      ctx.moveTo(origin.x, 0);
      ctx.lineTo(origin.x, cssH);
      ctx.stroke();
    }

    // Tick labels (major grid) - pinned to the canvas edge when the axis is off-screen
    if (showMajor && axisConfig.xMajorGridSize * pxPerUnitX >= 30) {
      const labelY = Math.min(Math.max(origin.y + 22, 16), cssH - 8);
      const labelXBase = Math.min(Math.max(origin.x - 12, 34), cssW - 6);

      ctx.fillStyle = '#1f2937';
      ctx.font = 'bold 13px sans-serif';

      // X-axis ticks
      ctx.textAlign = 'center';
      for (let i = Math.ceil(xMinVis / axisConfig.xMajorGridSize); i * axisConfig.xMajorGridSize <= xMaxVis; i++) {
        const x = i * axisConfig.xMajorGridSize;
        if (Math.abs(x) < 1e-9) continue;
        const screenX = worldToScreen({ x, y: 0 }, canvas).x;
        const label = Number.isInteger(x) ? x.toString() : x.toFixed(1);
        ctx.fillText(label, screenX, labelY);
      }

      // Y-axis ticks
      ctx.textAlign = 'right';
      for (let i = Math.ceil(yMinVis / axisConfig.yMajorGridSize); i * axisConfig.yMajorGridSize <= yMaxVis; i++) {
        const y = i * axisConfig.yMajorGridSize;
        if (Math.abs(y) < 1e-9) continue;
        const screenY = worldToScreen({ x: 0, y }, canvas).y;
        const label = Number.isInteger(y) ? y.toString() : y.toFixed(1);
        ctx.fillText(label, labelXBase, screenY + 5);
      }
    }

    // Axis unit labels
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    if (xAxisVisible) {
      ctx.fillText(axisConfig.xUnit, cssW - 16, origin.y - 10);
    }
    if (yAxisVisible) {
      ctx.fillText(axisConfig.yUnit, origin.x + 18, 18);
    }
  }, [axisConfig, worldToScreen, screenToWorld]);

  const drawSegment = useCallback((ctx: CanvasRenderingContext2D, segment: LineSegment, canvas: HTMLCanvasElement, selectedSegs: Set<string>) => {
    const group = groups.find(g => g.id === segment.groupId);
    if (group && !group.visible) return;

    const start = worldToScreen(segment.start, canvas);
    const end = worldToScreen(segment.end, canvas);
    const color = group?.color || '#3b82f6';
    const baseWidth = group?.lineWidth ?? 2;
    const dash = LINE_DASH[group?.lineStyle ?? 'solid'];
    const opacity = group?.opacity ?? 1;

    // In delete mode the hovered segment turns red
    if (mode === 'delete' && segment.id === activeSegment) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = baseWidth + 2;
    } else if (selectedSegs.has(segment.id)) {
      // Selected segments are highlighted
      ctx.strokeStyle = color;
      ctx.lineWidth = baseWidth + 2;
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = segment.id === activeSegment ? baseWidth + 1 : baseWidth;
    }
    ctx.globalAlpha = opacity;
    ctx.setLineDash(dash);

    if (segment.type === 'curve' && segment.control) {
      // Quadratic Bezier drawn directly (clipped by the canvas bounds)
      const control = worldToScreen(segment.control, canvas);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.quadraticCurveTo(control.x, control.y, end.x, end.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Draw the control point (edit mode)
      if (mode === 'edit') {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(control.x, control.y, 6, 0, Math.PI * 2);
        ctx.fill();

        // Control lines
        ctx.strokeStyle = '#fca5a5';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(control.x, control.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // Edit mode: endpoints/midpoints only for the selected group (drag the midpoint to create a curve)
    if (mode === 'edit' && selectedGroup && segment.groupId === selectedGroup) {
      // Endpoints
      ctx.fillStyle = segment.id === activeSegment ? '#10b981' : '#3b82f6';
      ctx.beginPath();
      ctx.arc(start.x, start.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(end.x, end.y, 5, 0, Math.PI * 2);
      ctx.fill();
      
      // Midpoint (drag to create a curve)
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;
      ctx.fillStyle = segment.id === activeSegment ? '#ef4444' : '#9ca3af';
      ctx.beginPath();
      ctx.arc(midX, midY, 6, 0, Math.PI * 2);
      ctx.fill();
      
      // Midpoint border
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [groups, activeSegment, mode, selectedGroup, worldToScreen]);

  const drawPreview = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    if (!isDrawing || !drawStart || !currentMouse) return;

    const start = worldToScreen(drawStart, canvas);
    const end = worldToScreen(currentMouse, canvas);

    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Coordinate readout
    ctx.fillStyle = '#111827';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    const snapped = snapToGrid(currentMouse);
    ctx.fillText(`(${snapped.x.toFixed(2)}, ${snapped.y.toFixed(2)})`, end.x + 10, end.y - 10);
  }, [isDrawing, drawStart, currentMouse, worldToScreen, snapToGrid]);

  // Draw the copy preview
  const drawCopyPreview = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    if (copyingSegments.length === 0) return;
    
    // Preview dashes use a highly visible red
    ctx.strokeStyle = '#ef4444';  // red preview stroke
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]); // dashes indicate a preview
    ctx.globalAlpha = 0.85; // slightly transparent but clearly visible
    
    copyingSegments.forEach(segment => {
      const start = worldToScreen({ x: segment.start.x + copyOffset.x, y: segment.start.y + copyOffset.y }, canvas);
      const end = worldToScreen({ x: segment.end.x + copyOffset.x, y: segment.end.y + copyOffset.y }, canvas);

      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      if (segment.type === 'curve' && segment.control) {
        const control = worldToScreen({ x: segment.control.x + copyOffset.x, y: segment.control.y + copyOffset.y }, canvas);
        ctx.quadraticCurveTo(control.x, control.y, end.x, end.y);
      } else {
        ctx.lineTo(end.x, end.y);
      }
      ctx.stroke();
    });

    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;
  }, [copyingSegments, copyOffset, worldToScreen]);

  // Responsive canvas sizing
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = React.useState({ width: 800, height: 500 });

  // Redraw on mount and whenever any input changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Scale the context by devicePixelRatio so drawing stays sharp on Hi-DPI screens;
    // all drawing code below works in CSS pixels.
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    
    // Draw the grid
    drawGrid(ctx, canvas);
    
    // Draw segments
    segments.forEach(segment => drawSegment(ctx, segment, canvas, selectedSegments));
    
    // Draw the copy preview
    drawCopyPreview(ctx, canvas);

    // Draw the preview
    drawPreview(ctx, canvas);

    // Draw the rubber-band rect (blue dashes + translucent fill)
    if (selectionRect) {
      const p1 = worldToScreen(selectionRect.start, canvas);
      const p2 = worldToScreen(selectionRect.end, canvas);
      const x = Math.min(p1.x, p2.x);
      const y = Math.min(p1.y, p2.y);
      const w = Math.abs(p2.x - p1.x);
      const h = Math.abs(p2.y - p1.y);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
  }, [segments, groups, selectedSegments, axisConfig, activeSegment, isDrawing, drawStart, currentMouse, copyingSegments, copyOffset, drawGrid, drawSegment, drawCopyPreview, drawPreview, canvasSize, selectionRect, worldToScreen]);

  React.useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setCanvasSize({
          width: Math.floor(rect.width),
          height: Math.floor(rect.height)
        });
      }
    };

    updateSize();
    // ResizeObserver tracks container size changes from any cause
    // (window resize, orientation change, responsive layout shifts)
    const observer = new ResizeObserver(updateSize);
    if (containerRef.current) observer.observe(containerRef.current);
    window.addEventListener('resize', updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  // Touch handling: single finger is translated to mouse events (so all tools work),
  // two fingers become pinch-zoom + pan and never reach the tool logic.
  const pinchRef = React.useRef<{ dist: number; midX: number; midY: number } | null>(null);
  const ignoreSingleTouchRef = React.useRef(false); // true from pinch start until all fingers lift

  const touchDistance = (t: React.TouchList) =>
    Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const touchMidpoint = (t: React.TouchList) => ({
    midX: (t[0].clientX + t[1].clientX) / 2,
    midY: (t[0].clientY + t[1].clientY) / 2,
  });

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length >= 2) {
      // Cancel any in-progress single-finger action, then start the pinch gesture
      e.target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      ignoreSingleTouchRef.current = true;
      pinchRef.current = { dist: touchDistance(e.touches), ...touchMidpoint(e.touches) };
      return;
    }
    if (ignoreSingleTouchRef.current) return;
    const touch = e.touches[0];
    touch.target.dispatchEvent(new MouseEvent('mousedown', {
      clientX: touch.clientX,
      clientY: touch.clientY,
      bubbles: true,
    }));
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length >= 2 && pinchRef.current) {
      const prev = pinchRef.current;
      const dist = touchDistance(e.touches);
      const { midX, midY } = touchMidpoint(e.touches);

      // Zoom around the finger midpoint
      if (onZoomChange && canvasRef.current && prev.dist > 0) {
        const factor = dist / prev.dist;
        if (Math.abs(factor - 1) > 0.002) {
          const rect = canvasRef.current.getBoundingClientRect();
          onZoomChange(factor, { x: midX - rect.left, y: midY - rect.top });
        }
      }
      // Pan by the midpoint movement
      if (onPan) {
        onPan(midX - prev.midX, midY - prev.midY);
      }

      pinchRef.current = { dist, midX, midY };
      return;
    }
    if (ignoreSingleTouchRef.current) return;
    const touch = e.touches[0];
    touch.target.dispatchEvent(new MouseEvent('mousemove', {
      clientX: touch.clientX,
      clientY: touch.clientY,
      bubbles: true,
    }));
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length < 2) {
      pinchRef.current = null;
    }
    if (e.touches.length === 0) {
      const wasPinch = ignoreSingleTouchRef.current;
      ignoreSingleTouchRef.current = false;
      if (wasPinch) return; // pinch never produced a mousedown, so no mouseup needed
      e.target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    }
  };

  // Per-mode cursors. Icon cursors are drawn twice (thick black stroke under a thin
  // white stroke) so they stay visible on any background.
  const outlinedCursor = (paths: string, hotX: number, hotY: number, fallback: string) =>
    `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke-linecap='round' stroke-linejoin='round'%3E%3Cg stroke='black' stroke-width='3.5'%3E${paths}%3C/g%3E%3Cg stroke='white' stroke-width='1.8'%3E${paths}%3C/g%3E%3C/svg%3E") ${hotX} ${hotY}, ${fallback}`;

  const CROSSHAIR_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath stroke='black' stroke-width='2' d='M12 0v24M0 12h24'/%3E%3C/svg%3E") 12 12, crosshair`;
  const HAND_PATHS = `%3Cpath d='M18 11V6a2 2 0 0 0-4 0v5'/%3E%3Cpath d='M14 10V4a2 2 0 0 0-4 0v2'/%3E%3Cpath d='M10 10.5V6a2 2 0 0 0-4 0v8'/%3E%3Cpath d='m7 15-1.76-1.76a2 2 0 0 0-2.83 2.82l3.6 3.6C7.5 21.14 9.2 22 12 22h2a8 8 0 0 0 8-8V7a2 2 0 0 0-4 0v5'/%3E`;
  const PENCIL_PATHS = `%3Cpath d='M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z'/%3E%3Cpath d='m15 5 4 4'/%3E`;
  const TRASH_PATHS = `%3Cpath d='M3 6h18'/%3E%3Cpath d='M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6'/%3E%3Cpath d='M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'/%3E%3Cpath d='M10 11v6'/%3E%3Cpath d='M14 11v6'/%3E`;

  const GRAB_CURSOR = outlinedCursor(HAND_PATHS, 12, 12, 'grab');
  const PENCIL_CURSOR = outlinedCursor(PENCIL_PATHS, 3, 21, 'default'); // hotspot at the pen tip
  const TRASH_CURSOR = outlinedCursor(TRASH_PATHS, 12, 12, 'default');

  const MODE_CURSORS: Record<WaveformCanvasProps['mode'], string> = {
    draw: CROSSHAIR_CURSOR,
    edit: PENCIL_CURSOR,
    delete: TRASH_CURSOR,
    moveGroup: GRAB_CURSOR,
    pan: GRAB_CURSOR,
    select: 'default',
  };

  // Wheel zoom (centered on the cursor)
  const handleWheel = (e: React.WheelEvent) => {
    // Block all default behavior (page scroll etc.)
    e.preventDefault();
    e.stopPropagation();

    if (onZoomChange && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      // deltaY > 0 scrolls down (zoom out), deltaY < 0 zooms in.
      // Ctrl restricts the zoom to the X axis, Shift to the Y axis.
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const axis: ZoomAxis = e.ctrlKey ? 'x' : e.shiftKey ? 'y' : 'both';
      onZoomChange(factor, { x: e.clientX - rect.left, y: e.clientY - rect.top }, axis);
    }

    return false;
  };

  return (
    <div ref={containerRef} className="w-full h-full touch-none overflow-hidden">
      <canvas
        ref={canvasRef}
        width={Math.round(canvasSize.width * (window.devicePixelRatio || 1))}
        height={Math.round(canvasSize.height * (window.devicePixelRatio || 1))}
        className="bg-white"
        style={{
          width: canvasSize.width,
          height: canvasSize.height,
          cursor: panning ? GRAB_CURSOR : MODE_CURSORS[mode]
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onDoubleClick={onDoubleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
        onScroll={(e) => { e.preventDefault(); e.stopPropagation(); }}
      />
    </div>
  );
};
