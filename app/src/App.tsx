import React, { useCallback, useState } from 'react';
import { useWaveform, BASE_SCALE, MIN_SCALE, MAX_SCALE } from '@/hooks/useWaveform';
import { WaveformCanvas } from '@/components/WaveformCanvas';
import { Toolbar } from '@/components/Toolbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pencil, Edit2, Trash2, GripHorizontal, Undo2, Redo2, MousePointer2, Download, FileJson, Image, Hand } from 'lucide-react';
import type { Point, ToolMode } from '@/types/waveform';

// Site links
const GITHUB_REPO_URL = 'https://github.com/CHESTNUT0061/WaveSketch';
const WPD_URL = 'https://apps.automeris.io/wpd4/';

// Tooltip wrapper for buttons
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

  // Position using the tooltip's measured size after render so long text never overflows the screen
  React.useLayoutEffect(() => {
    if (!show || !buttonRef.current || !tooltipRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const tipWidth = tooltipRef.current.offsetWidth;
    const tipHeight = tooltipRef.current.offsetHeight;

    let x = rect.left + rect.width / 2;
    const y = position === 'bottom' ? rect.bottom + 8 : rect.top - tipHeight - 8;

    // Clamp horizontally within the screen (8px margin)
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
            visibility: tooltipPos.x === 0 ? 'hidden' : 'visible', // avoid flicker before the first measurement
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

  // Drag state for edit mode
  const [draggingEndpoint, setDraggingEndpoint] = useState<{ segmentId: string; point: 'start' | 'end' } | null>(null);
  const [draggingMidpoint, setDraggingMidpoint] = useState<string | null>(null); // dragging a midpoint to create a curve
  // Whether this drag actually changed segments (decides if history is saved on mouse-up)
  const dragChangedRef = React.useRef(false);

  // Rubber-band state (dragging empty space in select mode, unsnapped world coords)
  const [marquee, setMarquee] = useState<{ start: Point; end: Point } | null>(null);
  const marqueeAdditiveRef = React.useRef(false);

  // Previous tool mode, restored when the pan toggle is switched off
  const prevModeRef = React.useRef<ToolMode>('draw');
  const togglePanMode = useCallback(() => {
    if (mode === 'pan') {
      setMode(prevModeRef.current);
    } else {
      prevModeRef.current = mode;
      setMode('pan');
    }
  }, [mode, setMode]);

  // Canvas panning state (middle-button drag or Space+left drag)
  const [isPanning, setIsPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const panStartRef = React.useRef<{ clientX: number; clientY: number; centerX: number; centerY: number } | null>(null);

  // Visit counter (Busuanzi): only loaded on the deployed domain; local dev is not counted
  React.useEffect(() => {
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js';
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, []);

  // Holding Space arms canvas panning
  React.useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) =>
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTypingTarget(e.target)) {
        e.preventDefault(); // prevent page scrolling
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
  // Move-offset display
  const [moveOffset, setMoveOffset] = useState<{ x: number; y: number } | null>(null);
  
  // Offset readout for select mode (top-right of canvas)
  const [selectCopyOffset, setSelectCopyOffset] = useState<{ x: number; y: number } | null>(null);

  // Keyboard shortcuts (Ctrl+C copy to clipboard, Ctrl+V start paste preview)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+C / Cmd+C: copy selected segments to the clipboard
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && mode === 'select' && selectedSegments.size > 0) {
        e.preventDefault();
        copyToClipboard();
      }
      // Ctrl+V / Cmd+V: start the paste preview
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && mode === 'select' && clipboardSegments.length > 0 && !isCopyPreview) {
        e.preventDefault();
        // Use the current mouse position as the paste origin
        const originPoint = currentMouse || { x: 0, y: 0 };
        enterCopyPreview(originPoint);
      }
      // Enter confirms the paste
      if (e.key === 'Enter' && isCopyPreview) {
        e.preventDefault();
        confirmCopyPreview();
        setSelectCopyOffset(null);
      }
      // Escape Cancel the paste preview
      if (e.key === 'Escape' && isCopyPreview) {
        e.preventDefault();
        cancelCopyPreview();
        setSelectCopyOffset(null);
      }
      // Delete/Backspace removes selected segments (ignored while an input has focus)
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

  // Import a JSON file
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

  // Zoom handler: factor is the multiplier; when screenPos (canvas coords) is given, zoom around that point
  const handleZoom = useCallback((factor: number, screenPos?: Point) => {
    const canvas = canvasRef.current;
    setViewport(prev => {
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * factor));
      if (newScale === prev.scale) return prev;
      if (!screenPos || !canvas) {
        return { ...prev, scale: newScale };
      }
      // Keep the world point under the cursor fixed on screen
      const dx = screenPos.x - canvas.clientWidth / 2;
      const dy = screenPos.y - canvas.clientHeight / 2;
      const worldX = prev.centerX + dx / prev.scale;
      const worldY = prev.centerY - dy / prev.scale;
      return {
        centerX: worldX - dx / newScale,
        centerY: worldY + dy / newScale,
        scale: newScale,
      };
    });
  }, [canvasRef, setViewport]);

  // Pan by a screen-pixel delta (used by the two-finger touch gesture)
  const handleTouchPan = useCallback((dxCss: number, dyCss: number) => {
    setViewport(prev => ({
      ...prev,
      centerX: prev.centerX - dxCss / prev.scale,
      centerY: prev.centerY + dyCss / prev.scale,
    }));
  }, [setViewport]);

  // Reset the viewport (origin, 100% zoom)
  const resetViewport = useCallback(() => {
    setViewport({ centerX: 0, centerY: 0, scale: BASE_SCALE });
  }, [setViewport]);

  // Fit to content: zoom the viewport to enclose all visible waveforms (10% margin)
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

    const xRange = Math.max(xMax - xMin, 0.5); // avoid division by zero for single points / flat lines
    const yRange = Math.max(yMax - yMin, 0.5);
    const scale = Math.max(MIN_SCALE, Math.min(
      MAX_SCALE,
      canvas.clientWidth / (xRange * 1.2),
      canvas.clientHeight / (yRange * 1.2)
    ));

    setViewport({
      centerX: (xMin + xMax) / 2,
      centerY: (yMin + yMax) / 2,
      scale,
    });
  }, [segments, groups, canvasRef, setViewport]);

  // Clear activeSegment when switching groups
  const handleSelectGroup = useCallback((groupId: string | null) => {
    setSelectedGroup(groupId);
    setActiveSegment(null); // clear the highlight
  }, [setSelectedGroup, setActiveSegment]);

  // Mouse position in world coordinates
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

  // Hit-test control points (selected group only)
  const checkControlPointHit = useCallback((e: React.MouseEvent): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    if (!selectedGroup) return null; // no hit-testing without a selected group
    
    const rect = canvas.getBoundingClientRect();
    const clickPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    
    for (const segment of segments) {
      // only test segments of the selected group
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

  // Hit-test segment midpoints (edit mode, selected group only)
  const checkMidpointHit = useCallback((e: React.MouseEvent): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    if (!selectedGroup) return null; // no hit-testing without a selected group
    
    const rect = canvas.getBoundingClientRect();
    const clickPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    
    for (const segment of segments) {
      // only test segments of the selected group
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

  // Hit-test segment endpoints (edit mode, selected group only)
  const checkEndpointHit = useCallback((e: React.MouseEvent): { segmentId: string; point: 'start' | 'end' } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    if (!selectedGroup) return null; // no hit-testing without a selected group
    
    const rect = canvas.getBoundingClientRect();
    const clickPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    
    for (const segment of segments) {
      // only test segments of the selected group
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

  // Hit-test segments (used for delete/select)
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

  // Distance from a point to a segment
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

    // Canvas panning: middle button or Space+left in any mode, or plain left drag in pan mode
    if (e.button === 1 || ((spaceHeld || mode === 'pan') && e.button === 0)) {
      panStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        centerX: viewport.centerX,
        centerY: viewport.centerY,
      };
      setIsPanning(true);
      return;
    }
    if (e.button !== 0) return; // ignore right-clicks

    if (mode === 'draw') {
      const worldPos = getMouseWorldPos(e);
      const snapped = snapToGrid(worldPos);
      setIsDrawing(true);
      setDrawStart(snapped);
      setCurrentMouse(snapped);
    } else if (mode === 'edit') {
      // Edit mode requires a selected group
      if (!selectedGroup) {
        // Without a selected group, only selection is possible
        const segmentId = checkSegmentHit(e);
        if (segmentId) {
          toggleSegmentSelection(segmentId, e.shiftKey);
        } else {
          clearSegmentSelection();
        }
        return;
      }
      
      // Edit mode: check control points, endpoints, then midpoints (drag targets) - selected group only
      
      // 1. Control point hit?
      const controlSegmentId = checkControlPointHit(e);
      if (controlSegmentId) {
        dragChangedRef.current = false;
        setDraggingControl(controlSegmentId);
        return;
      }

      // 2. Endpoint hit?
      const endpointInfo = checkEndpointHit(e);
      if (endpointInfo) {
        dragChangedRef.current = false;
        setDraggingEndpoint(endpointInfo);
        return;
      }

      // 3. Midpoint hit (creates a curve)?
      const midpointSegmentId = checkMidpointHit(e);
      if (midpointSegmentId) {
        setDraggingMidpoint(midpointSegmentId);
        const worldPos = getMouseWorldPos(e);
        const snapped = snapToGrid(worldPos);
        // Add a control point (line->curve is a real change; history saved on mouse-up)
        updateControlPoint(midpointSegmentId, snapped);
        dragChangedRef.current = true;
        return;
      }
      
      // 4. Segment hit (for selection)?
      const segmentId = checkSegmentHit(e);
      if (segmentId) {
        toggleSegmentSelection(segmentId, e.shiftKey);
        return;
      }
      
      // Clicking empty space clears the selection
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
        setMoveOffset({ x: 0, y: 0 }); // reset the offset
      }
    } else if (mode === 'select') {
      // Select mode: click to select, Shift+click to multi-select (across groups)
      if (isCopyPreview) {
        // In paste preview, a click confirms the paste
        confirmCopyPreview();
        setSelectCopyOffset(null);
        return;
      }
      const segmentId = checkSegmentHit(e);
      if (segmentId) {
        // Mouse-down on an already-selected segment (no Shift): start dragging the selection
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
        // Empty space: start rubber-band selection (unsnapped); without Shift, clear the selection first
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
    // Canvas panning in progress
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
      // the draw preview updates automatically
    } else if (draggingControl) {
      // Dragging a control point
      updateControlPoint(draggingControl, snapped);
      dragChangedRef.current = true;
    } else if (draggingMidpoint) {
      // Dragging a midpoint (adjusting the curve control point)
      updateControlPoint(draggingMidpoint, snapped);
    } else if (movingGroup && moveStartPoint) {
      const rawDeltaX = snapped.x - moveStartPoint.x;
      const rawDeltaY = snapped.y - moveStartPoint.y;
      // Snap to the minor grid
      const snapDeltaX = Math.round(rawDeltaX / axisConfig.xGridSize) * axisConfig.xGridSize;
      const snapDeltaY = Math.round(rawDeltaY / axisConfig.yGridSize) * axisConfig.yGridSize;
      // Only move/update when there is an actual offset
      if (snapDeltaX !== 0 || snapDeltaY !== 0) {
        moveGroup(movingGroup, snapDeltaX, snapDeltaY);
        setMoveStartPoint(snapped);
        // Accumulate the total offset for display
        setMoveOffset(prev => ({
          x: (prev?.x || 0) + snapDeltaX,
          y: (prev?.y || 0) + snapDeltaY
        }));
      }
    } else if (draggingEndpoint) {
      // Dragging an endpoint
      moveSegmentEndpoint(draggingEndpoint.segmentId, draggingEndpoint.point, snapped);
      dragChangedRef.current = true;
    } else if (marquee) {
      // Rubber-band in progress: update the rect (unsnapped coords)
      setMarquee({ start: marquee.start, end: worldPos });
    } else if (isDraggingSelected && dragStartPoint) {
      // Dragging the selected segments
      const rawDeltaX = snapped.x - dragStartPoint.x;
      const rawDeltaY = snapped.y - dragStartPoint.y;
      // Snap to the minor grid
      const snapDeltaX = Math.round(rawDeltaX / axisConfig.xGridSize) * axisConfig.xGridSize;
      const snapDeltaY = Math.round(rawDeltaY / axisConfig.yGridSize) * axisConfig.yGridSize;
      if (snapDeltaX !== 0 || snapDeltaY !== 0) {
        moveSelectedSegments(snapDeltaX, snapDeltaY);
        setDragStartPoint(snapped);
        // Accumulate the total offset for display
        setMoveOffset(prev => ({
          x: (prev?.x || 0) + snapDeltaX,
          y: (prev?.y || 0) + snapDeltaY
        }));
      }
    } else if (mode === 'delete') {
      const segmentId = checkSegmentHit(e);
      setActiveSegment(segmentId);
    } else if (mode === 'select') {
      // Select mode - highlight the hovered segment
      if (!isCopyPreview) {
        const segmentId = checkSegmentHit(e);
        setActiveSegment(segmentId);
      } else {
        // Paste preview - update the offset
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
      // Rubber-band end: counts as a selection only if the rect exceeds a few pixels, otherwise it's a plain click
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
      // Control-point drag finished: save history only if something changed
      if (dragChangedRef.current) {
        dragChangedRef.current = false;
        setTimeout(saveToHistory, 0);
      }
      setDraggingControl(null);
    } else if (draggingMidpoint) {
      // Midpoint drag finished: save the final curve position to history
      if (dragChangedRef.current) {
        dragChangedRef.current = false;
        setTimeout(saveToHistory, 0);
      }
      setDraggingMidpoint(null);
    } else if (movingGroup) {
      finishMoveGroup();
      setMoveOffset(null); // clear the offset display
    } else if (draggingEndpoint) {
      // Endpoint drag finished: save history only if something changed
      if (dragChangedRef.current) {
        dragChangedRef.current = false;
        setTimeout(saveToHistory, 0);
      }
      setDraggingEndpoint(null);
      setActiveSegment(null);
    } else if (isDraggingSelected) {
      // Selection drag finished: skip history if nothing actually moved
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

  // Tool button tooltips
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

    <div className="min-h-screen bg-gray-100 p-2 sm:p-4">
      <div className="w-full mx-auto max-w-[95%] lg:h-[92vh]">
        {/* Title */}
        <h1 className="text-xl font-bold text-gray-800 mb-3">波形绘制工具</h1>

        {/* Toolbar: wraps on narrow screens */}
        <div className="flex flex-wrap justify-between items-center mb-3 gap-2">
          <div className="flex flex-wrap gap-2">
            <ToolButton toolMode="select" label="选择" icon={MousePointer2} />
            <ToolButton toolMode="draw" label="绘制" icon={Pencil} />
            <ToolButton toolMode="edit" label="编辑" icon={Edit2} />
            <ToolButton toolMode="delete" label="删除" icon={Trash2} />
            <ToolButton toolMode="moveGroup" label="移组" icon={GripHorizontal} />
          </div>
          <div className="flex flex-wrap gap-2">
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

        {/* Main content: stacked vertically on narrow screens, side-by-side on desktop */}
        <div className="flex flex-col lg:flex-row gap-4 lg:h-[calc(92vh-120px)]">
          {/* Left: canvas + axis settings */}
          <div className="flex flex-col gap-3 w-full lg:w-3/4">
            {/* Canvas */}
            <div className="relative bg-white rounded-lg shadow h-[55vh] lg:h-auto lg:flex-1" style={{ touchAction: 'none', overflow: 'hidden' }}>
              {/* Zoom control (bottom-left) */}
              <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 bg-white/90 rounded-lg px-2 py-1 shadow border">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleZoom(0.8)}>−</Button>
                <span className="text-xs font-mono w-14 text-center">{Math.round((viewport.scale / BASE_SCALE) * 100)}%</span>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleZoom(1.25)}>+</Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={resetViewport}>复位</Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={fitToContent} disabled={segments.length === 0}>适应内容</Button>
                <Button
                  variant={mode === 'pan' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 px-2 text-xs flex items-center gap-1"
                  onClick={togglePanMode}
                  title="拖动平移画布（触屏单指拖动，双指捏合缩放）"
                >
                  <Hand className="w-3.5 h-3.5" />平移
                </Button>
                <span className="hidden sm:inline text-[10px] text-gray-400 pl-1 border-l">中键/空格+拖拽平移</span>
              </div>

              {/* Offset readout (while moving a group or previewing a paste) */}
              {moveOffset && (
                <div className="absolute top-3 right-3 z-10 bg-black/70 text-white px-3 py-2 rounded text-sm font-mono">
                  <div>ΔX: {moveOffset.x >= 0 ? '+' : ''}{(moveOffset.x / axisConfig.xGridSize).toFixed(1)}格</div>
                  <div>ΔY: {moveOffset.y >= 0 ? '+' : ''}{(moveOffset.y / axisConfig.yGridSize).toFixed(1)}格</div>
                </div>
              )}
              
              {/* Paste-preview offset readout (top-right of canvas) */}
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
                onPan={handleTouchPan}
                panning={isPanning || isDraggingSelected ? 'active' : spaceHeld ? 'ready' : null}
                selectionRect={marquee}
                canvasRef={canvasRef}
              />
            </div>

            {/* Axis settings */}
            <div className="bg-white p-3 rounded-lg shadow">
              <div className="text-sm font-medium mb-2 text-gray-700">坐标设置</div>
              <div className="flex flex-wrap items-center gap-y-2">
                {/* Y axis (left) */}
                <div className="flex flex-wrap items-center gap-3 flex-1 min-w-fit">
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
                {/* Divider (desktop only) */}
                <div className="hidden lg:block w-px h-8 bg-gray-300 mx-4" />
                {/* X axis (right) */}
                <div className="flex flex-wrap items-center gap-3 flex-1 min-w-fit">
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

          {/* Right: waveform group management */}
          <div className="w-full lg:w-1/4 lg:h-full">
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

        {/* Footer: visit counter + links */}
        <div className="flex justify-between items-center mt-2 px-1 text-xs text-gray-400">
          <div className="flex gap-2">
            {/* Busuanzi counter: hidden until the script loads */}
            <span id="busuanzi_container_site_pv" style={{ display: 'none' }}>
              本工具已被使用 <span id="busuanzi_value_site_pv" /> 次
            </span>
            <span id="busuanzi_container_site_uv" style={{ display: 'none' }}>
              · 访客 <span id="busuanzi_value_site_uv" /> 人
            </span>
          </div>
          <div className="flex flex-wrap gap-4">
            <a href={WPD_URL} target="_blank" rel="noreferrer" className="hover:text-gray-600 underline">
              推荐：曲线取点工具 WebPlotDigitizer
            </a>
            {GITHUB_REPO_URL && (
              <a href={`${GITHUB_REPO_URL}/issues`} target="_blank" rel="noreferrer" className="hover:text-gray-600 underline">
                意见反馈
              </a>
            )}
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
