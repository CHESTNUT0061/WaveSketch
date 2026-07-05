import React, { useCallback, useState } from 'react';
import { useWaveform, BASE_SCALE, MIN_SCALE, MAX_SCALE } from '@/hooks/useWaveform';
import { WaveformCanvas } from '@/components/WaveformCanvas';
import { Toolbar } from '@/components/Toolbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pencil, Edit2, Trash2, GripHorizontal, Undo2, Redo2, MousePointer2, Download, FileJson, Image } from 'lucide-react';
import type { Point, ToolMode } from '@/types/waveform';

// 站点链接（GitHub 仓库地址创建后填入，留空则不显示）
const GITHUB_REPO_URL = '';
const WPD_URL = 'https://apps.automeris.io/wpd4/';

// 按钮说明组件
interface TooltipButtonProps {
  children: React.ReactNode;
  tooltip: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

const TooltipButton: React.FC<TooltipButtonProps> = ({ children, tooltip, position = 'bottom' }) => {
  const [show, setShow] = useState(false);
  const buttonRef = React.useRef<HTMLDivElement>(null);
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const [tooltipPos, setTooltipPos] = React.useState({ x: 0, y: 0 });

  // 渲染后用提示框的实际尺寸定位，避免长文字超出屏幕边界
  React.useLayoutEffect(() => {
    if (!show || !buttonRef.current || !tooltipRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const tipWidth = tooltipRef.current.offsetWidth;
    const tipHeight = tooltipRef.current.offsetHeight;

    let x = rect.left + rect.width / 2;
    const y = position === 'bottom' ? rect.bottom + 8 : rect.top - tipHeight - 8;

    // 左右都不超出屏幕（留8px边距）
    x = Math.max(tipWidth / 2 + 8, Math.min(window.innerWidth - tipWidth / 2 - 8, x));

    setTooltipPos({ x, y });
  }, [show, position, tooltip]);

  return (
    <div
      ref={buttonRef}
      className="relative inline-block"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div
          ref={tooltipRef}
          className="fixed z-[100] px-3 py-2 bg-gray-800 text-white text-xs rounded whitespace-nowrap pointer-events-none"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.y,
            transform: 'translate(-50%, 0)',
            visibility: tooltipPos.x === 0 ? 'hidden' : 'visible', // 首帧测量前不闪烁
          }}
        >
          {tooltip}
          <div
            className="absolute w-2 h-2 bg-gray-800 rotate-45"
            style={{
              left: '50%',
              top: position === 'bottom' ? '-4px' : 'auto',
              bottom: position === 'top' ? '-4px' : 'auto',
              transform: 'translateX(-50%)'
            }}
          />
        </div>
      )}
    </div>
  );
};

function App() {
  const {
    segments,
    groups,
    axisConfig,
    viewport,
    setViewport,
    mode,
    selectedGroup,
    activeSegment,
    isDrawing,
    drawStart,
    currentMouse,
    draggingControl,
    movingGroup,
    moveStartPoint,
    canUndo,
    canRedo,
    copyingSegments,
    copyOffset,
    isDraggingSelected,
    dragStartPoint,
    isCopyPreview,
    copyPreviewOffset,
    clipboardSegments,
    canvasRef,
    setAxisConfig,
    setMode,
    setSelectedGroup,
    setActiveSegment,
    setIsDrawing,
    setDrawStart,
    setCurrentMouse,
    setDraggingControl,
    setMovingGroup,
    setMoveStartPoint,
    setDragStartPoint,
    screenToWorld,
    snapToGrid,
    addSegment,
    updateControlPoint,
    addControlPoint,
    deleteSegment,
    createGroup,
    deleteGroup,
    renameGroup,
    changeGroupColor,
    duplicateGroup,
    moveGroup,
    finishMoveGroup,
    moveSegmentEndpoint,
    toggleGroupVisibility,
    toggleSegmentSelection,
    clearSegmentSelection,
    selectSegmentsInRect,
    deleteSelectedSegments,
    setIsDraggingSelected,
    saveToHistory,
    moveSelectedSegments,
    finishMoveSelectedSegments,
    copyToClipboard,
    enterCopyPreview,
    updateCopyPreviewOffset,
    confirmCopyPreview,
    cancelCopyPreview,
    selectedSegments,
    calculateExpression,
    clearAll,
    undo,
    redo,
    downloadSVG,
    downloadPNG,
    downloadJSON,
    importData,
    generateWaveform,
    worldToScreen,
  } = useWaveform();

  // 编辑模式拖动状态
  const [draggingEndpoint, setDraggingEndpoint] = useState<{ segmentId: string; point: 'start' | 'end' } | null>(null);
  const [draggingMidpoint, setDraggingMidpoint] = useState<string | null>(null); // 拖动中点创建曲线
  // 本次拖动是否实际改动了线段（决定松手时要不要存撤销历史）
  const dragChangedRef = React.useRef(false);

  // 框选状态（选择模式下拖拽空白处，世界坐标不吸附）
  const [marquee, setMarquee] = useState<{ start: Point; end: Point } | null>(null);
  const marqueeAdditiveRef = React.useRef(false);

  // 画布平移状态（中键拖拽或空格+左键拖拽）
  const [isPanning, setIsPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const panStartRef = React.useRef<{ clientX: number; clientY: number; centerX: number; centerY: number } | null>(null);

  // 访问人次统计（不蒜子）：只在正式部署的域名上加载，本地开发不计数
  React.useEffect(() => {
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js';
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, []);

  // 空格键按住时进入平移待命状态
  React.useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) =>
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTypingTarget(e.target)) {
        e.preventDefault(); // 防止页面滚动
        setSpaceHeld(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpaceHeld(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);
  // 移动偏移显示
  const [moveOffset, setMoveOffset] = useState<{ x: number; y: number } | null>(null);
  
  // 选择模式下的偏移显示（画布右上角）
  const [selectCopyOffset, setSelectCopyOffset] = useState<{ x: number; y: number } | null>(null);

  // 键盘事件监听（Ctrl+C 复制到剪贴板，Ctrl+V 触发复制预览）
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+C 或 Cmd+C：复制选中的线到剪贴板
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && mode === 'select' && selectedSegments.size > 0) {
        e.preventDefault();
        copyToClipboard();
      }
      // Ctrl+V 或 Cmd+V：触发复制预览
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && mode === 'select' && clipboardSegments.length > 0 && !isCopyPreview) {
        e.preventDefault();
        // 使用当前鼠标位置作为复制原点
        const originPoint = currentMouse || { x: 0, y: 0 };
        enterCopyPreview(originPoint);
      }
      // Enter 确认复制
      if (e.key === 'Enter' && isCopyPreview) {
        e.preventDefault();
        confirmCopyPreview();
        setSelectCopyOffset(null);
      }
      // Escape 取消复制预览
      if (e.key === 'Escape' && isCopyPreview) {
        e.preventDefault();
        cancelCopyPreview();
        setSelectCopyOffset(null);
      }
      // Delete/Backspace 删除选中的线段（输入框有焦点时不触发）
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedSegments.size > 0 && !isCopyPreview) {
        const target = e.target as HTMLElement;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable) {
          return;
        }
        e.preventDefault();
        deleteSelectedSegments();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, selectedSegments.size, isCopyPreview, currentMouse, clipboardSegments.length, copyToClipboard, enterCopyPreview, confirmCopyPreview, cancelCopyPreview, deleteSelectedSegments]);

  // 导入JSON文件
  const handleImportJSON = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        importData(data);
      } catch (error) {
        alert('导入失败：文件格式不正确');
      }
    };
    reader.readAsText(file);
  }, [importData]);

  // 缩放处理：factor为缩放倍数；传入screenPos（画布坐标）时以该点为中心缩放
  const handleZoom = useCallback((factor: number, screenPos?: Point) => {
    const canvas = canvasRef.current;
    setViewport(prev => {
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * factor));
      if (newScale === prev.scale) return prev;
      if (!screenPos || !canvas) {
        return { ...prev, scale: newScale };
      }
      // 保持鼠标下方的世界点在屏幕上位置不变
      const dx = screenPos.x - canvas.width / 2;
      const dy = screenPos.y - canvas.height / 2;
      const worldX = prev.centerX + dx / prev.scale;
      const worldY = prev.centerY - dy / prev.scale;
      return {
        centerX: worldX - dx / newScale,
        centerY: worldY + dy / newScale,
        scale: newScale,
      };
    });
  }, [canvasRef, setViewport]);

  // 复位视口（回原点、100%缩放）
  const resetViewport = useCallback(() => {
    setViewport({ centerX: 0, centerY: 0, scale: BASE_SCALE });
  }, [setViewport]);

  // 适应内容：缩放视口刚好框住所有可见波形（四周留10%边距）
  const fitToContent = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const visibleSegments = segments.filter(s => {
      const g = groups.find(g => g.id === s.groupId);
      return !g || g.visible;
    });
    if (visibleSegments.length === 0) return;

    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    visibleSegments.forEach(s => {
      const pts = s.control ? [s.start, s.end, s.control] : [s.start, s.end];
      pts.forEach(p => {
        xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x);
        yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y);
      });
    });

    const xRange = Math.max(xMax - xMin, 0.5); // 防止单点/水平线导致除零
    const yRange = Math.max(yMax - yMin, 0.5);
    const scale = Math.max(MIN_SCALE, Math.min(
      MAX_SCALE,
      canvas.width / (xRange * 1.2),
      canvas.height / (yRange * 1.2)
    ));

    setViewport({
      centerX: (xMin + xMax) / 2,
      centerY: (yMin + yMax) / 2,
      scale,
    });
  }, [segments, groups, canvasRef, setViewport]);

  // 切换选中组时清除activeSegment
  const handleSelectGroup = useCallback((groupId: string | null) => {
    setSelectedGroup(groupId);
    setActiveSegment(null); // 清除高亮状态
  }, [setSelectedGroup, setActiveSegment]);

  // 获取鼠标在世界坐标系中的位置
  const getMouseWorldPos = useCallback((e: React.MouseEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const screenPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    return screenToWorld(screenPoint, canvas);
  }, [canvasRef, screenToWorld]);

  // 检查是否点击了控制点（只检测选中组的线段）
  const checkControlPointHit = useCallback((e: React.MouseEvent): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    if (!selectedGroup) return null; // 没有选中组时不检测
    
    const rect = canvas.getBoundingClientRect();
    const clickPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    
    for (const segment of segments) {
      // 只检测选中组的线段
      if (segment.groupId !== selectedGroup) continue;
      if (segment.control) {
        const controlScreen = worldToScreen(segment.control, canvas);
        const dist = Math.sqrt(
          Math.pow(clickPoint.x - controlScreen.x, 2) +
          Math.pow(clickPoint.y - controlScreen.y, 2)
        );
        if (dist < 10) {
          return segment.id;
        }
      }
    }
    return null;
  }, [segments, selectedGroup, worldToScreen, canvasRef]);

  // 检查是否点击了线段中点（编辑模式用，只检测选中组的线段）
  const checkMidpointHit = useCallback((e: React.MouseEvent): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    if (!selectedGroup) return null; // 没有选中组时不检测
    
    const rect = canvas.getBoundingClientRect();
    const clickPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    
    for (const segment of segments) {
      // 只检测选中组的线段
      if (segment.groupId !== selectedGroup) continue;
      
      const start = worldToScreen(segment.start, canvas);
      const end = worldToScreen(segment.end, canvas);
      
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;
      
      const dist = Math.sqrt(
        Math.pow(clickPoint.x - midX, 2) +
        Math.pow(clickPoint.y - midY, 2)
      );
      
      if (dist < 12) {
        return segment.id;
      }
    }
    return null;
  }, [segments, selectedGroup, worldToScreen, canvasRef]);

  // 检查是否点击了线段端点（编辑模式用，只检测选中组的线段）
  const checkEndpointHit = useCallback((e: React.MouseEvent): { segmentId: string; point: 'start' | 'end' } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    if (!selectedGroup) return null; // 没有选中组时不检测
    
    const rect = canvas.getBoundingClientRect();
    const clickPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    
    for (const segment of segments) {
      // 只检测选中组的线段
      if (segment.groupId !== selectedGroup) continue;
      
      const start = worldToScreen(segment.start, canvas);
      const end = worldToScreen(segment.end, canvas);
      
      const distStart = Math.sqrt(
        Math.pow(clickPoint.x - start.x, 2) +
        Math.pow(clickPoint.y - start.y, 2)
      );
      if (distStart < 10) {
        return { segmentId: segment.id, point: 'start' };
      }
      
      const distEnd = Math.sqrt(
        Math.pow(clickPoint.x - end.x, 2) +
        Math.pow(clickPoint.y - end.y, 2)
      );
      if (distEnd < 10) {
        return { segmentId: segment.id, point: 'end' };
      }
    }
    return null;
  }, [segments, selectedGroup, worldToScreen, canvasRef]);

  // 检查是否点击了线段（用于删除）
  const checkSegmentHit = useCallback((e: React.MouseEvent): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    
    const rect = canvas.getBoundingClientRect();
    const clickPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    
    let closestSegment: string | null = null;
    let closestDist = Infinity;
    
    for (const segment of segments) {
      const start = worldToScreen(segment.start, canvas);
      const end = worldToScreen(segment.end, canvas);
      
      const dist = pointToLineDistance(clickPoint, start, end);
      
      if (dist < 10 && dist < closestDist) {
        closestDist = dist;
        closestSegment = segment.id;
      }
    }
    return closestSegment;
  }, [segments, worldToScreen, canvasRef]);

  // 计算点到线段的距离
  const pointToLineDistance = (p: Point, a: Point, b: Point): number => {
    const ab = { x: b.x - a.x, y: b.y - a.y };
    const ap = { x: p.x - a.x, y: p.y - a.y };
    const abLen = Math.sqrt(ab.x * ab.x + ab.y * ab.y);
    
    if (abLen === 0) return Math.sqrt(ap.x * ap.x + ap.y * ap.y);
    
    const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / (abLen * abLen)));
    const closest = {
      x: a.x + t * ab.x,
      y: a.y + t * ab.y,
    };
    
    return Math.sqrt(Math.pow(p.x - closest.x, 2) + Math.pow(p.y - closest.y, 2));
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();

    // 画布平移：中键，或空格+左键（任何模式下可用）
    if (e.button === 1 || (spaceHeld && e.button === 0)) {
      panStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        centerX: viewport.centerX,
        centerY: viewport.centerY,
      };
      setIsPanning(true);
      return;
    }
    if (e.button !== 0) return; // 忽略右键

    if (mode === 'draw') {
      const worldPos = getMouseWorldPos(e);
      const snapped = snapToGrid(worldPos);
      setIsDrawing(true);
      setDrawStart(snapped);
      setCurrentMouse(snapped);
    } else if (mode === 'edit') {
      // 编辑模式：需要先选中一个组
      if (!selectedGroup) {
        // 没有选中组时，只能进行选择操作
        const segmentId = checkSegmentHit(e);
        if (segmentId) {
          toggleSegmentSelection(segmentId, e.shiftKey);
        } else {
          clearSegmentSelection();
        }
        return;
      }
      
      // 编辑模式：优先检查控制点、端点、中点（拖动功能）- 只针对选中组
      
      // 1. 检查是否点击了控制点
      const controlSegmentId = checkControlPointHit(e);
      if (controlSegmentId) {
        dragChangedRef.current = false;
        setDraggingControl(controlSegmentId);
        return;
      }

      // 2. 检查是否点击了端点
      const endpointInfo = checkEndpointHit(e);
      if (endpointInfo) {
        dragChangedRef.current = false;
        setDraggingEndpoint(endpointInfo);
        return;
      }

      // 3. 检查是否点击了中点（创建曲线）
      const midpointSegmentId = checkMidpointHit(e);
      if (midpointSegmentId) {
        setDraggingMidpoint(midpointSegmentId);
        const worldPos = getMouseWorldPos(e);
        const snapped = snapToGrid(worldPos);
        // 添加控制点（线段变曲线是实际改动，松手时统一存历史）
        updateControlPoint(midpointSegmentId, snapped);
        dragChangedRef.current = true;
        return;
      }
      
      // 4. 检查是否点击了线段（用于选择）
      const segmentId = checkSegmentHit(e);
      if (segmentId) {
        toggleSegmentSelection(segmentId, e.shiftKey);
        return;
      }
      
      // 点击空白处清除选择
      clearSegmentSelection();
    } else if (mode === 'delete') {
      const segmentId = checkSegmentHit(e);
      if (segmentId) {
        deleteSegment(segmentId);
      }
    } else if (mode === 'moveGroup') {
      if (selectedGroup) {
        const worldPos = getMouseWorldPos(e);
        const snapped = snapToGrid(worldPos);
        setMovingGroup(selectedGroup);
        setMoveStartPoint(snapped);
        setMoveOffset({ x: 0, y: 0 }); // 重置偏移量
      }
    } else if (mode === 'select') {
      // 选择模式：点击线段选中，按住Shift连选（可跨组）
      if (isCopyPreview) {
        // 复制预览模式下，点击确认复制
        confirmCopyPreview();
        setSelectCopyOffset(null);
        return;
      }
      const segmentId = checkSegmentHit(e);
      if (segmentId) {
        // 按在已选中的线段上（不按Shift）：开始拖动整体移动
        if (selectedSegments.has(segmentId) && !e.shiftKey) {
          const worldPos = getMouseWorldPos(e);
          const snapped = snapToGrid(worldPos);
          setIsDraggingSelected(true);
          setDragStartPoint(snapped);
          setMoveOffset({ x: 0, y: 0 });
          return;
        }
        toggleSegmentSelection(segmentId, e.shiftKey);
      } else {
        // 点击空白处：开始框选（不吸附格点）；不按Shift先清除已有选择
        if (!e.shiftKey) {
          clearSegmentSelection();
        }
        const rawPos = getMouseWorldPos(e);
        marqueeAdditiveRef.current = e.shiftKey;
        setMarquee({ start: rawPos, end: rawPos });
      }
    }
  }, [mode, getMouseWorldPos, snapToGrid, setIsDrawing, setDrawStart, setCurrentMouse, checkSegmentHit, deleteSegment, selectedGroup, setMovingGroup, setMoveStartPoint, toggleSegmentSelection, clearSegmentSelection, checkControlPointHit, checkEndpointHit, checkMidpointHit, setDraggingControl, updateControlPoint, isCopyPreview, confirmCopyPreview, selectedSegments, setIsDraggingSelected, setDragStartPoint, spaceHeld, viewport.centerX, viewport.centerY]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // 画布平移中
    if (isPanning && panStartRef.current) {
      const start = panStartRef.current;
      const dx = e.clientX - start.clientX;
      const dy = e.clientY - start.clientY;
      setViewport(prev => ({
        ...prev,
        centerX: start.centerX - dx / prev.scale,
        centerY: start.centerY + dy / prev.scale,
      }));
      return;
    }

    const worldPos = getMouseWorldPos(e);
    const snapped = snapToGrid(worldPos);
    setCurrentMouse(snapped);
    
    if (isDrawing && drawStart) {
      // 绘制预览已自动更新
    } else if (draggingControl) {
      // 拖动控制点
      updateControlPoint(draggingControl, snapped);
      dragChangedRef.current = true;
    } else if (draggingMidpoint) {
      // 拖动中点（调整曲线控制点）
      updateControlPoint(draggingMidpoint, snapped);
    } else if (movingGroup && moveStartPoint) {
      const rawDeltaX = snapped.x - moveStartPoint.x;
      const rawDeltaY = snapped.y - moveStartPoint.y;
      // 吸附到最小格点
      const snapDeltaX = Math.round(rawDeltaX / axisConfig.xGridSize) * axisConfig.xGridSize;
      const snapDeltaY = Math.round(rawDeltaY / axisConfig.yGridSize) * axisConfig.yGridSize;
      // 只有实际有偏移时才移动和更新
      if (snapDeltaX !== 0 || snapDeltaY !== 0) {
        moveGroup(movingGroup, snapDeltaX, snapDeltaY);
        setMoveStartPoint(snapped);
        // 累积显示总偏移量
        setMoveOffset(prev => ({
          x: (prev?.x || 0) + snapDeltaX,
          y: (prev?.y || 0) + snapDeltaY
        }));
      }
    } else if (draggingEndpoint) {
      // 拖动端点
      moveSegmentEndpoint(draggingEndpoint.segmentId, draggingEndpoint.point, snapped);
      dragChangedRef.current = true;
    } else if (marquee) {
      // 框选中：更新矩形（用未吸附的真实坐标）
      setMarquee({ start: marquee.start, end: worldPos });
    } else if (isDraggingSelected && dragStartPoint) {
      // 拖动移动选中的线段
      const rawDeltaX = snapped.x - dragStartPoint.x;
      const rawDeltaY = snapped.y - dragStartPoint.y;
      // 吸附到最小格点
      const snapDeltaX = Math.round(rawDeltaX / axisConfig.xGridSize) * axisConfig.xGridSize;
      const snapDeltaY = Math.round(rawDeltaY / axisConfig.yGridSize) * axisConfig.yGridSize;
      if (snapDeltaX !== 0 || snapDeltaY !== 0) {
        moveSelectedSegments(snapDeltaX, snapDeltaY);
        setDragStartPoint(snapped);
        // 累积显示总偏移量
        setMoveOffset(prev => ({
          x: (prev?.x || 0) + snapDeltaX,
          y: (prev?.y || 0) + snapDeltaY
        }));
      }
    } else if (mode === 'delete') {
      const segmentId = checkSegmentHit(e);
      setActiveSegment(segmentId);
    } else if (mode === 'select') {
      // 选择模式 - 高亮悬停的线段
      if (!isCopyPreview) {
        const segmentId = checkSegmentHit(e);
        setActiveSegment(segmentId);
      } else {
        // 复制预览模式 - 更新偏移量
        updateCopyPreviewOffset(snapped);
        setSelectCopyOffset({ x: copyPreviewOffset.x, y: copyPreviewOffset.y });
      }
    }
  }, [getMouseWorldPos, snapToGrid, isDrawing, drawStart, draggingControl, updateControlPoint, draggingMidpoint, movingGroup, moveStartPoint, moveGroup, setMoveStartPoint, draggingEndpoint, moveSegmentEndpoint, isDraggingSelected, dragStartPoint, moveSelectedSegments, setDragStartPoint, mode, checkSegmentHit, setActiveSegment, setCurrentMouse, isCopyPreview, updateCopyPreviewOffset, copyPreviewOffset, isPanning, setViewport, marquee]);

  const handleMouseUp = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
      return;
    }
    if (marquee) {
      // 框选结束：拖出的矩形超过几个像素才算框选，否则视为单纯点击空白
      const pxW = Math.abs(marquee.end.x - marquee.start.x) * viewport.scale;
      const pxH = Math.abs(marquee.end.y - marquee.start.y) * viewport.scale;
      if (pxW > 4 || pxH > 4) {
        selectSegmentsInRect(marquee.start, marquee.end, marqueeAdditiveRef.current);
      }
      setMarquee(null);
      return;
    }
    if (isDrawing && drawStart && currentMouse) {
      const dist = Math.sqrt(
        Math.pow(currentMouse.x - drawStart.x, 2) +
        Math.pow(currentMouse.y - drawStart.y, 2)
      );
      
      if (dist > 0.01) {
        addSegment(drawStart, currentMouse, 'line');
      }
      
      setIsDrawing(false);
      setDrawStart(null);
      setCurrentMouse(null);
    } else if (draggingControl) {
      // 拖动曲线控制点结束：有实际改动才存历史
      if (dragChangedRef.current) {
        dragChangedRef.current = false;
        setTimeout(saveToHistory, 0);
      }
      setDraggingControl(null);
    } else if (draggingMidpoint) {
      // 拖中点创建/调整曲线结束：存最终位置到历史
      if (dragChangedRef.current) {
        dragChangedRef.current = false;
        setTimeout(saveToHistory, 0);
      }
      setDraggingMidpoint(null);
    } else if (movingGroup) {
      finishMoveGroup();
      setMoveOffset(null); // 清除偏移显示
    } else if (draggingEndpoint) {
      // 拖动端点结束：有实际改动才存历史
      if (dragChangedRef.current) {
        dragChangedRef.current = false;
        setTimeout(saveToHistory, 0);
      }
      setDraggingEndpoint(null);
      setActiveSegment(null);
    } else if (isDraggingSelected) {
      // 拖动移动选中的线段结束：没有实际移动就不存历史
      if (moveOffset && (moveOffset.x !== 0 || moveOffset.y !== 0)) {
        finishMoveSelectedSegments();
      } else {
        setIsDraggingSelected(false);
        setDragStartPoint(null);
      }
      setMoveOffset(null);
    }
  }, [isDrawing, drawStart, currentMouse, addSegment, setIsDrawing, setDrawStart, setCurrentMouse, draggingControl, setDraggingControl, draggingMidpoint, setDraggingMidpoint, movingGroup, finishMoveGroup, draggingEndpoint, setActiveSegment, isDraggingSelected, finishMoveSelectedSegments, moveOffset, setIsDraggingSelected, setDragStartPoint, saveToHistory, isPanning, marquee, viewport.scale, selectSegmentsInRect]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (mode === 'edit') {
      const segmentId = checkSegmentHit(e);
      if (segmentId) {
        const worldPos = getMouseWorldPos(e);
        const snapped = snapToGrid(worldPos);
        addControlPoint(segmentId, snapped);
      }
    }
  }, [mode, checkSegmentHit, getMouseWorldPos, snapToGrid, addControlPoint]);

  // 工具按钮说明
  const TOOLTIPS: Record<string, string> = {
    draw: '点击并拖动画直线，吸附格点',
    edit: '先选组，再拖动端点/中点/控制点',
    delete: '点击线段删除',
    moveGroup: '拖动整组波形移动',
    select: '点击选中，拖空白框选，Shift连选，拖动移动，Delete删除，Ctrl+C复制',
    undo: '撤销上一步操作',
    redo: '恢复上一步操作',
    svg: '导出SVG图片，可在Visio中编辑',
    png: '导出高分辨率PNG图片（3倍分辨率）',
    import: '导入波形数据，继续上次编辑',
    export: '导出波形数据，方便下次编辑',
  };

  const ToolButton = ({ toolMode, label, icon: Icon }: { toolMode: ToolMode; label: string; icon: React.ElementType }) => (
    <TooltipButton tooltip={TOOLTIPS[toolMode]}>
      <Button
        variant={mode === toolMode ? 'default' : 'outline'}
        size="sm"
        onClick={() => setMode(toolMode)}
        className="flex items-center gap-1"
      >
        <Icon className="w-4 h-4" />
        {label}
      </Button>
    </TooltipButton>
  );

  return (

    <div className="min-h-screen bg-gray-100 p-4">
      <div className="w-full mx-auto" style={{ maxWidth: '95%', height: '92vh' }}>
        {/* 标题 */}
        <h1 className="text-xl font-bold text-gray-800 mb-3">波形绘制工具</h1>

        {/* 工具栏 */}
        <div className="flex justify-between items-center mb-3">
          <div className="flex gap-2">
            <ToolButton toolMode="select" label="选择" icon={MousePointer2} />
            <ToolButton toolMode="draw" label="绘制" icon={Pencil} />
            <ToolButton toolMode="edit" label="编辑" icon={Edit2} />
            <ToolButton toolMode="delete" label="删除" icon={Trash2} />
            <ToolButton toolMode="moveGroup" label="移组" icon={GripHorizontal} />
          </div>
          <div className="flex gap-2">
            <TooltipButton tooltip={TOOLTIPS.svg}>
              <Button variant="outline" size="sm" onClick={() => downloadSVG()} className="flex items-center gap-1">
                <Image className="w-4 h-4" />SVG
              </Button>
            </TooltipButton>
            <TooltipButton tooltip={TOOLTIPS.png}>
              <Button variant="outline" size="sm" onClick={() => downloadPNG()} className="flex items-center gap-1">
                <Image className="w-4 h-4" />PNG
              </Button>
            </TooltipButton>
            <input type="file" id="import-json" accept=".json" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) { handleImportJSON(file); e.target.value = ''; }
            }} />
            <TooltipButton tooltip={TOOLTIPS.import}>
              <Button variant="outline" size="sm" onClick={() => document.getElementById('import-json')?.click()} className="flex items-center gap-1">
                <Download className="w-4 h-4" />导入
              </Button>
            </TooltipButton>
            <TooltipButton tooltip={TOOLTIPS.export}>
              <Button variant="outline" size="sm" onClick={() => downloadJSON()} className="flex items-center gap-1">
                <FileJson className="w-4 h-4" />导出
              </Button>
            </TooltipButton>
            <TooltipButton tooltip={TOOLTIPS.undo}>
              <Button variant="outline" size="sm" onClick={undo} disabled={!canUndo} className="flex items-center gap-1">
                <Undo2 className="w-4 h-4" />撤销
              </Button>
            </TooltipButton>
            <TooltipButton tooltip={TOOLTIPS.redo}>
              <Button variant="outline" size="sm" onClick={redo} disabled={!canRedo} className="flex items-center gap-1">
                <Redo2 className="w-4 h-4" />恢复
              </Button>
            </TooltipButton>
          </div>
        </div>

        {/* 主内容区 */}
        <div className="flex gap-4 h-[calc(92vh-120px)]">
          {/* 左侧：画布 + 坐标设置 */}
          <div className="flex flex-col gap-3" style={{ width: '75%' }}>
            {/* 画布 */}
            <div className="relative bg-white rounded-lg shadow flex-1" style={{ touchAction: 'none', overflow: 'hidden' }}>
              {/* 缩放控制（左下） */}
              <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 bg-white/90 rounded-lg px-2 py-1 shadow border">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleZoom(0.8)}>−</Button>
                <span className="text-xs font-mono w-14 text-center">{Math.round((viewport.scale / BASE_SCALE) * 100)}%</span>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleZoom(1.25)}>+</Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={resetViewport}>复位</Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={fitToContent} disabled={segments.length === 0}>适应内容</Button>
                <span className="text-[10px] text-gray-400 pl-1 border-l">中键/空格+拖拽平移</span>
              </div>

              {/* 偏移值显示（移动组或复制预览时） */}
              {moveOffset && (
                <div className="absolute top-3 right-3 z-10 bg-black/70 text-white px-3 py-2 rounded text-sm font-mono">
                  <div>ΔX: {moveOffset.x >= 0 ? '+' : ''}{(moveOffset.x / axisConfig.xGridSize).toFixed(1)}格</div>
                  <div>ΔY: {moveOffset.y >= 0 ? '+' : ''}{(moveOffset.y / axisConfig.yGridSize).toFixed(1)}格</div>
                </div>
              )}
              
              {/* 选择模式复制预览偏移显示（画布右上角） */}
              {isCopyPreview && selectCopyOffset && (
                <div className="absolute top-3 right-3 z-10 bg-blue-600/90 text-white px-3 py-2 rounded text-sm font-mono shadow-lg">
                  <div className="text-xs text-blue-200 mb-1">复制预览 (Enter确认/Esc取消)</div>
                  <div>ΔX: {(selectCopyOffset.x / axisConfig.xGridSize).toFixed(0)}格 ({selectCopyOffset.x >= 0 ? '+' : ''}{selectCopyOffset.x.toFixed(2)})</div>
                  <div>ΔY: {(selectCopyOffset.y / axisConfig.yGridSize).toFixed(0)}格 ({selectCopyOffset.y >= 0 ? '+' : ''}{selectCopyOffset.y.toFixed(2)})</div>
                </div>
              )}

              <WaveformCanvas
                segments={segments}
                groups={groups}
                selectedSegments={selectedSegments}
                axisConfig={axisConfig}
                mode={mode}
                selectedGroup={selectedGroup}
                activeSegment={activeSegment}
                isDrawing={isDrawing}
                drawStart={drawStart}
                currentMouse={currentMouse}
                draggingControl={draggingControl}
                copyingSegments={copyingSegments}
                copyOffset={copyOffset}
                worldToScreen={worldToScreen}
                screenToWorld={screenToWorld}
                snapToGrid={snapToGrid}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onDoubleClick={handleDoubleClick}
                onZoomChange={handleZoom}
                panning={isPanning ? 'active' : spaceHeld ? 'ready' : null}
                selectionRect={marquee}
                canvasRef={canvasRef}
              />
            </div>

            {/* 坐标设置 */}
            <div className="bg-white p-3 rounded-lg shadow">
              <div className="text-sm font-medium mb-2 text-gray-700">坐标设置</div>
              <div className="flex items-center">
                {/* Y坐标（左侧） */}
                <div className="flex items-center gap-4 flex-1">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-gray-500 whitespace-nowrap">Y单位</Label>
                    <Input value={axisConfig.yUnit} onChange={(e) => setAxisConfig({ ...axisConfig, yUnit: e.target.value })} className="h-7 w-14 text-sm px-2" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-gray-500 whitespace-nowrap">次格点</Label>
                    <Input type="number" step="0.1" value={axisConfig.yGridSize} onChange={(e) => setAxisConfig({ ...axisConfig, yGridSize: parseFloat(e.target.value) || 0.5 })} className="h-7 w-14 text-sm px-2" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-gray-500 whitespace-nowrap">主格点</Label>
                    <Input type="number" step="0.5" value={axisConfig.yMajorGridSize} onChange={(e) => setAxisConfig({ ...axisConfig, yMajorGridSize: parseFloat(e.target.value) || 2 })} className="h-7 w-14 text-sm px-2" />
                  </div>
                </div>
                {/* 分割线 */}
                <div className="w-px h-8 bg-gray-300 mx-4" />
                {/* X坐标（右侧） */}
                <div className="flex items-center gap-4 flex-1">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-gray-500 whitespace-nowrap">X单位</Label>
                    <Input value={axisConfig.xUnit} onChange={(e) => setAxisConfig({ ...axisConfig, xUnit: e.target.value })} className="h-7 w-14 text-sm px-2" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-gray-500 whitespace-nowrap">次格点</Label>
                    <Input type="number" step="0.1" value={axisConfig.xGridSize} onChange={(e) => setAxisConfig({ ...axisConfig, xGridSize: parseFloat(e.target.value) || 0.5 })} className="h-7 w-14 text-sm px-2" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-gray-500 whitespace-nowrap">主格点</Label>
                    <Input type="number" step="0.5" value={axisConfig.xMajorGridSize} onChange={(e) => setAxisConfig({ ...axisConfig, xMajorGridSize: parseFloat(e.target.value) || 2 })} className="h-7 w-14 text-sm px-2" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 右侧：波形组管理 */}
          <div style={{ width: '25%' }} className="h-full">
            <Toolbar
              groups={groups}
              selectedGroup={selectedGroup}
              onCreateGroup={createGroup}
              onDeleteGroup={deleteGroup}
              onToggleGroupVisibility={toggleGroupVisibility}
              onSelectGroup={handleSelectGroup}
              onCalculateWaveforms={calculateExpression}
              onClearAll={clearAll}
              onDuplicateGroup={duplicateGroup}
              onRenameGroup={renameGroup}
              onChangeGroupColor={changeGroupColor}
              selectedSegments={selectedSegments}
              onGenerateWaveform={generateWaveform}
              mode={mode}
              isCopyPreview={isCopyPreview}
              clipboardSegments={clipboardSegments}
            />
          </div>
        </div>

        {/* 页脚：访问统计 + 相关链接 */}
        <div className="flex justify-between items-center mt-2 px-1 text-xs text-gray-400">
          <div className="flex gap-2">
            {/* 不蒜子统计：脚本加载完成前自动隐藏 */}
            <span id="busuanzi_container_site_pv" style={{ display: 'none' }}>
              本工具已被使用 <span id="busuanzi_value_site_pv" /> 次
            </span>
            <span id="busuanzi_container_site_uv" style={{ display: 'none' }}>
              · 访客 <span id="busuanzi_value_site_uv" /> 人
            </span>
          </div>
          <div className="flex gap-4">
            <a href={WPD_URL} target="_blank" rel="noreferrer" className="hover:text-gray-600 underline">
              推荐：曲线取点工具 WebPlotDigitizer
            </a>
            {GITHUB_REPO_URL && (
              <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer" className="hover:text-gray-600 underline">
                GitHub
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
