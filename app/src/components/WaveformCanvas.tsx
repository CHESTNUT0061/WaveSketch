import React, { useEffect, useCallback } from 'react';
import type { Point, LineSegment, WaveformGroup, AxisConfig } from '@/types/waveform';

interface WaveformCanvasProps {
  segments: LineSegment[];
  groups: WaveformGroup[];
  selectedSegments: Set<string>;
  axisConfig: AxisConfig;
  mode: 'draw' | 'edit' | 'delete' | 'moveGroup' | 'select';
  selectedGroup: string | null;
  activeSegment: string | null;
  isDrawing: boolean;
  drawStart: Point | null;
  currentMouse: Point | null;
  draggingControl: string | null;
  copyingSegments?: LineSegment[]; // 正在复制的线段（预览用）
  copyOffset?: Point; // 复制偏移量
  worldToScreen: (point: Point, canvas: HTMLCanvasElement) => Point;
  screenToWorld: (point: Point, canvas: HTMLCanvasElement) => Point;
  snapToGrid: (point: Point) => Point;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: (e: React.MouseEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
  onZoomChange?: (factor: number, screenPos?: Point) => void;
  panning?: 'ready' | 'active' | null; // 平移状态：ready=按住空格待拖，active=拖拽中
  selectionRect?: { start: Point; end: Point } | null; // 框选矩形（世界坐标）
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
  panning = null,
  selectionRect = null,
  canvasRef,
}) => {
  const drawGrid = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    // 当前视口的世界坐标范围（无限画布：网格铺满整个画布）
    const topLeft = screenToWorld({ x: 0, y: 0 }, canvas);
    const bottomRight = screenToWorld({ x: canvas.width, y: canvas.height }, canvas);
    const xMinVis = topLeft.x;
    const xMaxVis = bottomRight.x;
    const yMinVis = bottomRight.y;
    const yMaxVis = topLeft.y;

    // 每世界单位对应的像素数（用于密度控制）
    const pxPerUnit = worldToScreen({ x: 1, y: 0 }, canvas).x - worldToScreen({ x: 0, y: 0 }, canvas).x;

    const isMajor = (v: number, major: number) =>
      Math.abs(v / major - Math.round(v / major)) < 1e-6;

    // 次格点（浅灰色实线）——间距小于5px时太密，跳过不画
    if (axisConfig.xGridSize * pxPerUnit >= 5 && axisConfig.yGridSize * pxPerUnit >= 5) {
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);

      // 垂直次格线（整数索引循环避免浮点累加误差）
      for (let i = Math.ceil(xMinVis / axisConfig.xGridSize); i * axisConfig.xGridSize <= xMaxVis; i++) {
        const x = i * axisConfig.xGridSize;
        if (isMajor(x, axisConfig.xMajorGridSize)) continue;
        const screenX = worldToScreen({ x, y: 0 }, canvas).x;
        ctx.beginPath();
        ctx.moveTo(screenX, 0);
        ctx.lineTo(screenX, canvas.height);
        ctx.stroke();
      }

      // 水平次格线
      for (let i = Math.ceil(yMinVis / axisConfig.yGridSize); i * axisConfig.yGridSize <= yMaxVis; i++) {
        const y = i * axisConfig.yGridSize;
        if (isMajor(y, axisConfig.yMajorGridSize)) continue;
        const screenY = worldToScreen({ x: 0, y }, canvas).y;
        ctx.beginPath();
        ctx.moveTo(0, screenY);
        ctx.lineTo(canvas.width, screenY);
        ctx.stroke();
      }
    }

    // 主格点（深灰色实线）——间距小于12px时跳过
    const showMajor = axisConfig.xMajorGridSize * pxPerUnit >= 12 && axisConfig.yMajorGridSize * pxPerUnit >= 12;
    if (showMajor) {
      ctx.strokeStyle = '#6b7280';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);

      for (let i = Math.ceil(xMinVis / axisConfig.xMajorGridSize); i * axisConfig.xMajorGridSize <= xMaxVis; i++) {
        const screenX = worldToScreen({ x: i * axisConfig.xMajorGridSize, y: 0 }, canvas).x;
        ctx.beginPath();
        ctx.moveTo(screenX, 0);
        ctx.lineTo(screenX, canvas.height);
        ctx.stroke();
      }

      for (let i = Math.ceil(yMinVis / axisConfig.yMajorGridSize); i * axisConfig.yMajorGridSize <= yMaxVis; i++) {
        const screenY = worldToScreen({ x: 0, y: i * axisConfig.yMajorGridSize }, canvas).y;
        ctx.beginPath();
        ctx.moveTo(0, screenY);
        ctx.lineTo(canvas.width, screenY);
        ctx.stroke();
      }
    }

    // 坐标轴（粗黑线）——原点在视野内才画
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;

    const origin = worldToScreen({ x: 0, y: 0 }, canvas);
    const xAxisVisible = origin.y >= 0 && origin.y <= canvas.height;
    const yAxisVisible = origin.x >= 0 && origin.x <= canvas.width;

    if (xAxisVisible) {
      ctx.beginPath();
      ctx.moveTo(0, origin.y);
      ctx.lineTo(canvas.width, origin.y);
      ctx.stroke();
    }
    if (yAxisVisible) {
      ctx.beginPath();
      ctx.moveTo(origin.x, 0);
      ctx.lineTo(origin.x, canvas.height);
      ctx.stroke();
    }

    // 刻度标签（主格点）——轴不在视野内时标签贴画布边缘显示
    if (showMajor && axisConfig.xMajorGridSize * pxPerUnit >= 30) {
      const labelY = Math.min(Math.max(origin.y + 22, 16), canvas.height - 8);
      const labelXBase = Math.min(Math.max(origin.x - 12, 34), canvas.width - 6);

      ctx.fillStyle = '#1f2937';
      ctx.font = 'bold 13px sans-serif';

      // X轴刻度
      ctx.textAlign = 'center';
      for (let i = Math.ceil(xMinVis / axisConfig.xMajorGridSize); i * axisConfig.xMajorGridSize <= xMaxVis; i++) {
        const x = i * axisConfig.xMajorGridSize;
        if (Math.abs(x) < 1e-9) continue;
        const screenX = worldToScreen({ x, y: 0 }, canvas).x;
        const label = Number.isInteger(x) ? x.toString() : x.toFixed(1);
        ctx.fillText(label, screenX, labelY);
      }

      // Y轴刻度
      ctx.textAlign = 'right';
      for (let i = Math.ceil(yMinVis / axisConfig.yMajorGridSize); i * axisConfig.yMajorGridSize <= yMaxVis; i++) {
        const y = i * axisConfig.yMajorGridSize;
        if (Math.abs(y) < 1e-9) continue;
        const screenY = worldToScreen({ x: 0, y }, canvas).y;
        const label = Number.isInteger(y) ? y.toString() : y.toFixed(1);
        ctx.fillText(label, labelXBase, screenY + 5);
      }
    }

    // 轴单位标签
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    if (xAxisVisible) {
      ctx.fillText(axisConfig.xUnit, canvas.width - 16, origin.y - 10);
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
    
    // 删除模式下，悬停的线段显示红色
    if (mode === 'delete' && segment.id === activeSegment) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 4;
    } else if (selectedSegs.has(segment.id)) {
      // 选中的线段显示高亮
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = segment.id === activeSegment ? 3 : 2;
    }
    
    if (segment.type === 'curve' && segment.control) {
      // 二次贝塞尔曲线直接绘制（画布边界自动裁剪）
      const control = worldToScreen(segment.control, canvas);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.quadraticCurveTo(control.x, control.y, end.x, end.y);
      ctx.stroke();

      // 绘制控制点（编辑模式）
      if (mode === 'edit') {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(control.x, control.y, 6, 0, Math.PI * 2);
        ctx.fill();

        // 控制线
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
    }
    
    // 编辑模式：只显示选中组的端点和中点（可拖动创建曲线）
    if (mode === 'edit' && selectedGroup && segment.groupId === selectedGroup) {
      // 端点
      ctx.fillStyle = segment.id === activeSegment ? '#10b981' : '#3b82f6';
      ctx.beginPath();
      ctx.arc(start.x, start.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(end.x, end.y, 5, 0, Math.PI * 2);
      ctx.fill();
      
      // 中点（可拖动创建曲线）
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;
      ctx.fillStyle = segment.id === activeSegment ? '#ef4444' : '#9ca3af';
      ctx.beginPath();
      ctx.arc(midX, midY, 6, 0, Math.PI * 2);
      ctx.fill();
      
      // 中点边框
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

    // 显示坐标
    ctx.fillStyle = '#111827';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    const snapped = snapToGrid(currentMouse);
    ctx.fillText(`(${snapped.x.toFixed(2)}, ${snapped.y.toFixed(2)})`, end.x + 10, end.y - 10);
  }, [isDrawing, drawStart, currentMouse, worldToScreen, snapToGrid]);

  // 绘制复制预览
  const drawCopyPreview = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    if (copyingSegments.length === 0) return;
    
    // 预览虚线使用高可见度的红色，确保用户能看到
    ctx.strokeStyle = '#ef4444';  // 红色预览线
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]); // 虚线表示预览
    ctx.globalAlpha = 0.85; // 稍透明但足够明显
    
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

  // 自适应画布大小
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = React.useState({ width: 800, height: 500 });

  // 初始渲染和尺寸变化时重绘
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 绘制网格
    drawGrid(ctx, canvas);
    
    // 绘制线段
    segments.forEach(segment => drawSegment(ctx, segment, canvas, selectedSegments));
    
    // 绘制复制预览
    drawCopyPreview(ctx, canvas);

    // 绘制预览
    drawPreview(ctx, canvas);

    // 绘制框选矩形（蓝色虚线 + 半透明填充）
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
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // 触摸事件处理
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
      clientX: touch.clientX,
      clientY: touch.clientY,
      bubbles: true,
    });
    touch.target.dispatchEvent(mouseEvent);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
      clientX: touch.clientX,
      clientY: touch.clientY,
      bubbles: true,
    });
    touch.target.dispatchEvent(mouseEvent);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    const mouseEvent = new MouseEvent('mouseup', {
      bubbles: true,
    });
    e.target.dispatchEvent(mouseEvent);
  };

  // 不同模式使用不同光标：选择=箭头，移组=抓手，其余=十字准星
  const CROSSHAIR_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath stroke='black' stroke-width='2' d='M12 0v24M0 12h24'/%3E%3C/svg%3E") 12 12, crosshair`;
  const MODE_CURSORS: Record<WaveformCanvasProps['mode'], string> = {
    draw: CROSSHAIR_CURSOR,
    edit: CROSSHAIR_CURSOR,
    delete: CROSSHAIR_CURSOR,
    moveGroup: 'grab',
    select: 'default',
  };

  // 滚轮缩放处理（以鼠标位置为中心）
  const handleWheel = (e: React.WheelEvent) => {
    // 阻止所有默认行为（防止页面滚动和任何视觉反馈）
    e.preventDefault();
    e.stopPropagation();

    if (onZoomChange && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      // deltaY > 0 表示向下滚动（缩小），deltaY < 0 表示向上滚动（放大）
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      onZoomChange(factor, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    }

    return false;
  };

  return (
    <div ref={containerRef} className="w-full h-full touch-none overflow-hidden">
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        className="bg-white"
        style={{ 
          width: canvasSize.width, 
          height: canvasSize.height,
          cursor: panning === 'active' ? 'grabbing' : panning === 'ready' ? 'grab' : MODE_CURSORS[mode]
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
