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
  onZoomChange?: (delta: number) => void;
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
  snapToGrid,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onDoubleClick,
  onZoomChange,
  canvasRef,
}) => {
  const drawGrid = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const padding = 60;
    
    // 次格点（浅灰色实线）
    ctx.strokeStyle = '#e5e7eb';  // 浅灰色
    ctx.lineWidth = 1;
    ctx.setLineDash([]);  // 实线
    
    // 垂直次格线 - 只在可见范围内绘制
    const xStart = Math.ceil(axisConfig.xMin / axisConfig.xGridSize) * axisConfig.xGridSize;
    for (let x = xStart; x <= axisConfig.xMax; x += axisConfig.xGridSize) {
      // 跳过主格点位置
      if (Math.abs(x % axisConfig.xMajorGridSize) < 0.001) continue;
      const screenX = worldToScreen({ x, y: 0 }, canvas).x;
      // 只绘制在画布范围内的线
      if (screenX >= padding && screenX <= canvas.width - padding) {
        ctx.beginPath();
        ctx.moveTo(screenX, padding);
        ctx.lineTo(screenX, canvas.height - padding);
        ctx.stroke();
      }
    }
    
    // 水平次格线 - 只在可见范围内绘制
    const yStart = Math.ceil(axisConfig.yMin / axisConfig.yGridSize) * axisConfig.yGridSize;
    for (let y = yStart; y <= axisConfig.yMax; y += axisConfig.yGridSize) {
      // 跳过主格点位置
      if (Math.abs(y % axisConfig.yMajorGridSize) < 0.001) continue;
      const screenY = worldToScreen({ x: 0, y }, canvas).y;
      // 只绘制在画布范围内的线
      if (screenY >= padding && screenY <= canvas.height - padding) {
        ctx.beginPath();
        ctx.moveTo(padding, screenY);
        ctx.lineTo(canvas.width - padding, screenY);
        ctx.stroke();
      }
    }
    
    // 主格点（实线，深灰色）
    ctx.strokeStyle = '#6b7280';  // 深灰色，更清晰
    ctx.lineWidth = 2;
    ctx.setLineDash([]);  // 实线
    
    // 垂直主格线 - 只在可见范围内绘制
    const xMajorStart = Math.ceil(axisConfig.xMin / axisConfig.xMajorGridSize) * axisConfig.xMajorGridSize;
    for (let x = xMajorStart; x <= axisConfig.xMax; x += axisConfig.xMajorGridSize) {
      const screenX = worldToScreen({ x, y: 0 }, canvas).x;
      // 只绘制在画布范围内的线
      if (screenX >= padding && screenX <= canvas.width - padding) {
        ctx.beginPath();
        ctx.moveTo(screenX, padding);
        ctx.lineTo(screenX, canvas.height - padding);
        ctx.stroke();
      }
    }
    
    // 水平主格线 - 只在可见范围内绘制
    const yMajorStart = Math.ceil(axisConfig.yMin / axisConfig.yMajorGridSize) * axisConfig.yMajorGridSize;
    for (let y = yMajorStart; y <= axisConfig.yMax; y += axisConfig.yMajorGridSize) {
      const screenY = worldToScreen({ x: 0, y }, canvas).y;
      // 只绘制在画布范围内的线
      if (screenY >= padding && screenY <= canvas.height - padding) {
        ctx.beginPath();
        ctx.moveTo(padding, screenY);
        ctx.lineTo(canvas.width - padding, screenY);
        ctx.stroke();
      }
    }
    
    // 坐标轴（粗黑线）- 只在可见范围内绘制
    ctx.strokeStyle = '#000000';  // 纯黑色
    ctx.lineWidth = 3;
    
    // X轴 - 只有当Y=0在可见范围内时才绘制
    const originY = worldToScreen({ x: 0, y: 0 }, canvas).y;
    if (originY >= padding && originY <= canvas.height - padding) {
      ctx.beginPath();
      ctx.moveTo(padding, originY);
      ctx.lineTo(canvas.width - padding, originY);
      ctx.stroke();
    }
    
    // Y轴 - 只有当X=0在可见范围内时才绘制
    const originX = worldToScreen({ x: 0, y: 0 }, canvas).x;
    if (originX >= padding && originX <= canvas.width - padding) {
      ctx.beginPath();
      ctx.moveTo(originX, padding);
      ctx.lineTo(originX, canvas.height - padding);
      ctx.stroke();
    }
    
    // 刻度标签（只在主格点且可见范围内显示）
    ctx.fillStyle = '#1f2937';  // 深黑色文字
    ctx.font = 'bold 13px sans-serif';  // 稍大字体
    ctx.textAlign = 'center';
    
    // X轴刻度（主格点）- 只在X轴可见时显示
    if (originY >= padding && originY <= canvas.height - padding) {
      for (let x = xMajorStart; x <= axisConfig.xMax; x += axisConfig.xMajorGridSize) {
        if (Math.abs(x) < 0.001) continue;
        const screenX = worldToScreen({ x, y: 0 }, canvas).x;
        // 只显示在画布范围内的标签
        if (screenX >= padding && screenX <= canvas.width - padding) {
          // 格式化数字显示
          const label = Number.isInteger(x) ? x.toString() : x.toFixed(1);
          ctx.fillText(label, screenX, originY + 22);
        }
      }
    }
    
    // Y轴刻度（主格点）- 只在Y轴可见时显示
    if (originX >= padding && originX <= canvas.width - padding) {
      ctx.textAlign = 'right';
      for (let y = yMajorStart; y <= axisConfig.yMax; y += axisConfig.yMajorGridSize) {
        if (Math.abs(y) < 0.001) continue;
        const screenY = worldToScreen({ x: 0, y }, canvas).y;
        // 只显示在画布范围内的标签
        if (screenY >= padding && screenY <= canvas.height - padding) {
          // 格式化数字显示
          const label = Number.isInteger(y) ? y.toString() : y.toFixed(1);
          ctx.fillText(label, originX - 12, screenY + 5);
        }
      }
    }
    
    // 轴标签 - 只在对应轴可见时显示
    ctx.fillStyle = '#000000';  // 纯黑色
    ctx.font = 'bold 16px sans-serif';  // 更大字体
    ctx.textAlign = 'center';
    if (originY >= padding && originY <= canvas.height - padding) {
      ctx.fillText(axisConfig.xUnit, canvas.width - padding + 25, originY + 6);
    }
    if (originX >= padding && originX <= canvas.width - padding) {
      ctx.fillText(axisConfig.yUnit, originX - 30, padding - 15);
    }
  }, [axisConfig, worldToScreen]);

  // Liang-Barsky 线段裁剪算法
  const clipSegmentToBounds = (segment: LineSegment): LineSegment | null => {
    const { xMin, xMax, yMin, yMax } = axisConfig;
    let { x: x1, y: y1 } = segment.start;
    let { x: x2, y: y2 } = segment.end;
    
    const dx = x2 - x1;
    const dy = y2 - y1;
    
    let p = [-dx, dx, -dy, dy];
    let q = [x1 - xMin, xMax - x1, y1 - yMin, yMax - y1];
    
    let u1 = 0;
    let u2 = 1;
    
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) {
        if (q[i] < 0) return null; // 平行且在外部
      } else {
        const t = q[i] / p[i];
        if (p[i] < 0) {
          u1 = Math.max(u1, t);
        } else {
          u2 = Math.min(u2, t);
        }
      }
    }
    
    if (u1 > u2) return null; // 完全在外部
    
    // 裁剪后的端点
    const newStart = {
      x: x1 + u1 * dx,
      y: y1 + u1 * dy
    };
    const newEnd = {
      x: x1 + u2 * dx,
      y: y1 + u2 * dy
    };
    
    return {
      ...segment,
      start: newStart,
      end: newEnd
    };
  };

  const drawSegment = useCallback((ctx: CanvasRenderingContext2D, segment: LineSegment, canvas: HTMLCanvasElement, selectedSegs: Set<string>) => {
    const group = groups.find(g => g.id === segment.groupId);
    if (group && !group.visible) return;
    
    // 裁剪线段
    const clippedSegment = clipSegmentToBounds(segment);
    if (!clippedSegment) return;
    
    const start = worldToScreen(clippedSegment.start, canvas);
    const end = worldToScreen(clippedSegment.end, canvas);
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
    
    if (clippedSegment.type === 'curve' && segment.control) {
      // 对曲线进行采样并裁剪
      const samples: Point[] = [];
      const numSamples = 20;
      for (let i = 0; i <= numSamples; i++) {
        const t = i / numSamples;
        const x = (1 - t) * (1 - t) * segment.start.x + 2 * (1 - t) * t * segment.control.x + t * t * segment.end.x;
        const y = (1 - t) * (1 - t) * segment.start.y + 2 * (1 - t) * t * segment.control.y + t * t * segment.end.y;
        
        // 检查点是否在范围内
        if (x >= axisConfig.xMin && x <= axisConfig.xMax && 
            y >= axisConfig.yMin && y <= axisConfig.yMax) {
          samples.push({ x, y });
        } else if (samples.length > 0) {
          // 点超出范围，绘制已收集的点
          break;
        }
      }
      
      // 绘制曲线段
      if (samples.length > 1) {
        ctx.beginPath();
        const first = worldToScreen(samples[0], canvas);
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < samples.length; i++) {
          const p = worldToScreen(samples[i], canvas);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
      
      // 绘制控制点（编辑模式）- 只在可见时显示
      if (mode === 'edit') {
        const controlInBounds = segment.control.x >= axisConfig.xMin && segment.control.x <= axisConfig.xMax &&
                                segment.control.y >= axisConfig.yMin && segment.control.y <= axisConfig.yMax;
        if (controlInBounds) {
          const control = worldToScreen(segment.control, canvas);
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
  }, [groups, activeSegment, mode, selectedGroup, worldToScreen, axisConfig]);

  const drawPreview = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    if (!isDrawing || !drawStart || !currentMouse) return;
    
    // 裁剪预览线
    const previewSegment = clipSegmentToBounds({ 
      id: 'preview', 
      start: drawStart, 
      end: currentMouse, 
      type: 'line' 
    });
    if (!previewSegment) return;
    
    const start = worldToScreen(previewSegment.start, canvas);
    const end = worldToScreen(previewSegment.end, canvas);
    
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // 显示坐标（只在范围内时显示）
    if (currentMouse.x >= axisConfig.xMin && currentMouse.x <= axisConfig.xMax &&
        currentMouse.y >= axisConfig.yMin && currentMouse.y <= axisConfig.yMax) {
      ctx.fillStyle = '#111827';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      const snapped = snapToGrid(currentMouse);
      ctx.fillText(`(${snapped.x.toFixed(2)}, ${snapped.y.toFixed(2)})`, end.x + 10, end.y - 10);
    }
  }, [isDrawing, drawStart, currentMouse, worldToScreen, snapToGrid, axisConfig]);

  // 绘制复制预览
  const drawCopyPreview = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    if (copyingSegments.length === 0) return;
    
    // 预览虚线使用高可见度的红色，确保用户能看到
    ctx.strokeStyle = '#ef4444';  // 红色预览线
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]); // 虚线表示预览
    ctx.globalAlpha = 0.85; // 稍透明但足够明显
    
    copyingSegments.forEach(segment => {
      // 应用偏移后的线段
      const offsetSegment: LineSegment = {
        ...segment,
        start: { x: segment.start.x + copyOffset.x, y: segment.start.y + copyOffset.y },
        end: { x: segment.end.x + copyOffset.x, y: segment.end.y + copyOffset.y },
        control: segment.control ? { x: segment.control.x + copyOffset.x, y: segment.control.y + copyOffset.y } : undefined
      };
      
      // 裁剪到可见区域
      const clippedSegment = clipSegmentToBounds(offsetSegment);
      if (!clippedSegment) return;
      
      const start = worldToScreen(clippedSegment.start, canvas);
      const end = worldToScreen(clippedSegment.end, canvas);
      
      if (segment.type === 'curve' && segment.control) {
        // 对曲线进行采样并裁剪
        const samples: Point[] = [];
        const numSamples = 20;
        const startP = offsetSegment.start;
        const endP = offsetSegment.end;
        const controlP = offsetSegment.control!;
        
        for (let i = 0; i <= numSamples; i++) {
          const t = i / numSamples;
          const x = (1 - t) * (1 - t) * startP.x + 2 * (1 - t) * t * controlP.x + t * t * endP.x;
          const y = (1 - t) * (1 - t) * startP.y + 2 * (1 - t) * t * controlP.y + t * t * endP.y;
          
          if (x >= axisConfig.xMin && x <= axisConfig.xMax && 
              y >= axisConfig.yMin && y <= axisConfig.yMax) {
            samples.push({ x, y });
          } else if (samples.length > 0) {
            break;
          }
        }
        
        if (samples.length > 1) {
          ctx.beginPath();
          const first = worldToScreen(samples[0], canvas);
          ctx.moveTo(first.x, first.y);
          for (let i = 1; i < samples.length; i++) {
            const p = worldToScreen(samples[i], canvas);
            ctx.lineTo(p.x, p.y);
          }
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
    });
    
    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;
  }, [copyingSegments, copyOffset, worldToScreen, groups, axisConfig]);

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
  }, [segments, groups, selectedSegments, axisConfig, activeSegment, isDrawing, drawStart, currentMouse, copyingSegments, copyOffset, drawGrid, drawSegment, drawCopyPreview, drawPreview, canvasSize]);

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

  // 滚轮缩放处理
  const handleWheel = (e: React.WheelEvent) => {
    // 阻止所有默认行为（防止页面滚动和任何视觉反馈）
    e.preventDefault();
    e.stopPropagation();
    
    if (onZoomChange) {
      // deltaY > 0 表示向下滚动（缩小），deltaY < 0 表示向上滚动（放大）
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      onZoomChange(delta);
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
          cursor: MODE_CURSORS[mode]
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
