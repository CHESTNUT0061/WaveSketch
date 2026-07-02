import { useState, useCallback, useRef } from 'react';
import type { Point, LineSegment, WaveformGroup, AxisConfig, Viewport, CalcTerm, ToolMode } from '@/types/waveform';
import type { WaveformType } from '@/components/WaveformGenerator';

const generateId = () => Math.random().toString(36).slice(2, 11);

// 基准缩放：100% 时每个世界单位对应的像素数
export const BASE_SCALE = 40;
export const MIN_SCALE = BASE_SCALE * 0.1;  // 10%
export const MAX_SCALE = BASE_SCALE * 10;   // 1000%

const DEFAULT_VIEWPORT: Viewport = { centerX: 0, centerY: 0, scale: BASE_SCALE };

const COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
];

// 历史记录状态
interface HistoryState {
  segments: LineSegment[];
  groups: WaveformGroup[];
}

export function useWaveform() {
  const [segments, setSegments] = useState<LineSegment[]>([]);
  const [groups, setGroups] = useState<WaveformGroup[]>([]);
  
  // 历史记录（用于撤销/恢复）- 使用 ref 避免闭包问题
  const historyRef = useRef<HistoryState[]>([{ segments: [], groups: [] }]);
  const historyIndexRef = useRef<number>(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  
  // 用于获取最新状态的ref
  const segmentsRef = useRef<LineSegment[]>([]);
  const groupsRef = useRef<WaveformGroup[]>([]);
  
  // 同步ref和state
  segmentsRef.current = segments;
  groupsRef.current = groups;
  
  // 更新撤销/恢复状态
  const updateHistoryState = useCallback(() => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);
  
  const [axisConfig, setAxisConfig] = useState<AxisConfig>({
    xUnit: 't',
    yUnit: 'A',
    xGridSize: 0.5,      // 次格点（最小格点）
    yGridSize: 0.5,
    xMajorGridSize: 2,   // 主格点（显示数字）
    yMajorGridSize: 2,
  });
  // 无限画布视口（平移中心 + 缩放）
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [mode, setMode] = useState<ToolMode>('draw');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [activeSegment, setActiveSegment] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<Point | null>(null);
  const [currentMouse, setCurrentMouse] = useState<Point | null>(null);
  const [draggingControl, setDraggingControl] = useState<string | null>(null);
  const [movingGroup, setMovingGroup] = useState<string | null>(null);
  const [moveStartPoint, setMoveStartPoint] = useState<Point | null>(null);
  const [selectedSegments, setSelectedSegments] = useState<Set<string>>(new Set());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 复制模式相关状态
  const [copyingSegments, setCopyingSegments] = useState<LineSegment[]>([]); // 正在拖动的复制线段
  const [copyOffset, setCopyOffset] = useState<Point>({ x: 0, y: 0 }); // 复制偏移量
  const [copyStartPoint, setCopyStartPoint] = useState<Point | null>(null); // 复制起始点
  const [isDraggingSelected, setIsDraggingSelected] = useState(false); // 是否正在拖动选中的线段
  const [dragStartPoint, setDragStartPoint] = useState<Point | null>(null); // 拖动起始点

  // 选择模式复制预览状态
  const [isCopyPreview, setIsCopyPreview] = useState(false); // 是否正在显示复制预览
  const [copyPreviewOffset, setCopyPreviewOffset] = useState<Point>({ x: 0, y: 0 }); // 复制预览偏移量
  const [copyPreviewOrigin, setCopyPreviewOrigin] = useState<Point | null>(null); // 复制预览起始参考点
  const [clipboardSegments, setClipboardSegments] = useState<LineSegment[]>([]); // 剪贴板中的线段（Ctrl+C）

  // 保存到历史记录（保存当前状态作为新的一步）
  const saveToHistory = useCallback(() => {
    // 使用ref获取最新状态，避免闭包问题
    const newState: HistoryState = {
      segments: JSON.parse(JSON.stringify(segmentsRef.current)),
      groups: JSON.parse(JSON.stringify(groupsRef.current)),
    };
    
    // 删除当前索引之后的历史记录（如果有的话）
    const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    newHistory.push(newState);
    
    // 限制历史记录数量（最多50步）
    if (newHistory.length > 50) {
      newHistory.shift();
    }
    
    historyRef.current = newHistory;
    historyIndexRef.current = newHistory.length - 1;
    updateHistoryState();
  }, [updateHistoryState]);

  // 撤销
  const undo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      const prevState = historyRef.current[historyIndexRef.current];
      setSegments(JSON.parse(JSON.stringify(prevState.segments)));
      setGroups(JSON.parse(JSON.stringify(prevState.groups)));
      updateHistoryState();
    }
  }, [updateHistoryState]);

  // 恢复
  const redo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      const nextState = historyRef.current[historyIndexRef.current];
      setSegments(JSON.parse(JSON.stringify(nextState.segments)));
      setGroups(JSON.parse(JSON.stringify(nextState.groups)));
      updateHistoryState();
    }
  }, [updateHistoryState]);

  // 坐标转换：世界坐标 -> 屏幕坐标（以视口中心为基准）
  const worldToScreen = useCallback((point: Point, canvas: HTMLCanvasElement): Point => {
    return {
      x: canvas.width / 2 + (point.x - viewport.centerX) * viewport.scale,
      y: canvas.height / 2 - (point.y - viewport.centerY) * viewport.scale,
    };
  }, [viewport]);

  // 坐标转换：屏幕坐标 -> 世界坐标
  const screenToWorld = useCallback((point: Point, canvas: HTMLCanvasElement): Point => {
    return {
      x: viewport.centerX + (point.x - canvas.width / 2) / viewport.scale,
      y: viewport.centerY - (point.y - canvas.height / 2) / viewport.scale,
    };
  }, [viewport]);

  // 吸附到格点
  const snapToGrid = useCallback((point: Point): Point => {
    return {
      x: Math.round(point.x / axisConfig.xGridSize) * axisConfig.xGridSize,
      y: Math.round(point.y / axisConfig.yGridSize) * axisConfig.yGridSize,
    };
  }, [axisConfig]);

  // 添加线段（内部使用，不保存历史）
  const addSegmentInternal = useCallback((start: Point, end: Point, type: 'line' | 'curve' = 'line', targetGroupId?: string): string => {
    let effectiveGroupId = targetGroupId || selectedGroup;
    
    // 如果没有选中组，创建默认组
    if (!effectiveGroupId) {
      const defaultGroup = groups.find(g => g.name === '默认组');
      if (defaultGroup) {
        effectiveGroupId = defaultGroup.id;
      } else {
        const newGroup: WaveformGroup = {
          id: generateId(),
          name: '默认组',
          color: COLORS[0],
          visible: true,
          segments: [],
        };
        effectiveGroupId = newGroup.id;
        setGroups(prev => [...prev, newGroup]);
        setSelectedGroup(newGroup.id);
      }
    }
    
    const newSegment: LineSegment = {
      id: generateId(),
      start,
      end,
      type,
      groupId: effectiveGroupId,
    };
    
    setSegments(prev => [...prev, newSegment]);
    
    // 更新组的线段列表
    setGroups(prev => prev.map(g => 
      g.id === effectiveGroupId 
        ? { ...g, segments: [...g.segments, newSegment.id] }
        : g
    ));
    
    return newSegment.id;
  }, [selectedGroup, groups]);

  // 添加线段（公开接口，自动保存历史）
  const addSegment = useCallback((start: Point, end: Point, type: 'line' | 'curve' = 'line', targetGroupId?: string) => {
    const id = addSegmentInternal(start, end, type, targetGroupId);
    // 延迟保存添加后的状态（确保state已更新）
    setTimeout(() => saveToHistory(), 0);
    return id;
  }, [addSegmentInternal, saveToHistory]);

  // 更新线段控制点（曲线）
  const updateControlPoint = useCallback((segmentId: string, control: Point) => {
    setSegments(prev => prev.map(s => 
      s.id === segmentId ? { ...s, control, type: 'curve' } : s
    ));
  }, []);

  // 在线段上添加控制点
  const addControlPoint = useCallback((segmentId: string, controlPoint: Point) => {
    setSegments(prev => prev.map(s => 
      s.id === segmentId ? { ...s, control: controlPoint, type: 'curve' } : s
    ));
    setTimeout(saveToHistory, 0);
  }, [saveToHistory]);

  // 删除线段
  const deleteSegment = useCallback((segmentId: string) => {
    setSegments(prev => prev.filter(s => s.id !== segmentId));
    setGroups(prev => prev.map(g => ({
      ...g,
      segments: g.segments.filter(id => id !== segmentId)
    })));
    if (activeSegment === segmentId) {
      setActiveSegment(null);
    }
    setTimeout(saveToHistory, 0);
  }, [saveToHistory, activeSegment]);

  // 获取下一个可用颜色
  const getNextColor = useCallback((): string => {
    // 获取已使用的颜色
    const usedColors = new Set(groups.map(g => g.color));
    // 找到第一个未使用的颜色
    for (const color of COLORS) {
      if (!usedColors.has(color)) {
        return color;
      }
    }
    // 如果所有颜色都用过了，循环使用
    return COLORS[groups.length % COLORS.length];
  }, [groups]);

  // 创建组
  const createGroup = useCallback((name: string) => {
    const newGroup: WaveformGroup = {
      id: generateId(),
      name,
      color: getNextColor(),
      visible: true,
      segments: [],
    };
    setGroups(prev => [...prev, newGroup]);
    return newGroup.id;
  }, [getNextColor]);

  // 修改组颜色
  const changeGroupColor = useCallback((groupId: string, color: string) => {
    setGroups(prev => prev.map(g => 
      g.id === groupId ? { ...g, color } : g
    ));
  }, []);

  // 删除组
  const deleteGroup = useCallback((groupId: string) => {
    // 获取该组的所有线段ID
    const group = groups.find(g => g.id === groupId);
    const segmentIdsToDelete = group?.segments || [];
    // 删除该组的所有线段
    setSegments(prev => prev.filter(s => !segmentIdsToDelete.includes(s.id)));
    // 删除组
    setGroups(prev => prev.filter(g => g.id !== groupId));
    if (selectedGroup === groupId) {
      setSelectedGroup(null);
    }
    setTimeout(saveToHistory, 0);
  }, [saveToHistory, selectedGroup, groups]);

  // 重命名组
  const renameGroup = useCallback((groupId: string, newName: string) => {
    if (!newName.trim()) return;
    setGroups(prev => prev.map(g => 
      g.id === groupId ? { ...g, name: newName.trim() } : g
    ));
  }, []);

  // 复制组
  const duplicateGroup = useCallback((groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    
    const groupSegments = segments.filter(s => group.segments.includes(s.id));
    if (groupSegments.length === 0) return;
    
    // 创建新组
    const newGroupId = generateId();
    const newGroup: WaveformGroup = {
      id: newGroupId,
      name: `${group.name} 副本`,
      color: COLORS[groups.length % COLORS.length],
      visible: true,
      segments: [],
    };
    
    // 复制线段（向右偏移2个格点单位）
    const offsetX = axisConfig.xGridSize * 2;
    const newSegmentIds: string[] = [];
    
    groupSegments.forEach(segment => {
      const newSegment: LineSegment = {
        id: generateId(),
        start: { x: segment.start.x + offsetX, y: segment.start.y },
        end: { x: segment.end.x + offsetX, y: segment.end.y },
        type: segment.type,
        groupId: newGroupId,
      };
      if (segment.control) {
        newSegment.control = { x: segment.control.x + offsetX, y: segment.control.y };
      }
      newSegmentIds.push(newSegment.id);
      setSegments(prev => [...prev, newSegment]);
    });
    
    newGroup.segments = newSegmentIds;
    setGroups(prev => [...prev, newGroup]);
    setSelectedGroup(newGroupId);
    setTimeout(saveToHistory, 0);
  }, [groups, segments, axisConfig.xGridSize, saveToHistory]);

  // 移动组（吸附到格点）
  const moveGroup = useCallback((groupId: string, deltaX: number, deltaY: number) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    
    // 吸附到最小格点
    const snapDeltaX = Math.round(deltaX / axisConfig.xGridSize) * axisConfig.xGridSize;
    const snapDeltaY = Math.round(deltaY / axisConfig.yGridSize) * axisConfig.yGridSize;
    
    setSegments(prev => prev.map(s => {
      if (s.groupId !== groupId) return s;
      return {
        ...s,
        start: { x: s.start.x + snapDeltaX, y: s.start.y + snapDeltaY },
        end: { x: s.end.x + snapDeltaX, y: s.end.y + snapDeltaY },
        control: s.control ? { x: s.control.x + snapDeltaX, y: s.control.y + snapDeltaY } : undefined,
      };
    }));
  }, [groups, axisConfig.xGridSize, axisConfig.yGridSize]);

  // 完成组移动（保存历史）
  const finishMoveGroup = useCallback(() => {
    saveToHistory();
    setMovingGroup(null);
    setMoveStartPoint(null);
  }, [saveToHistory]);

  // 移动线段的指定端点
  const moveSegmentEndpoint = useCallback((segmentId: string, point: 'start' | 'end', newPos: Point) => {
    setSegments(prev => prev.map(s => {
      if (s.id !== segmentId) return s;
      
      const oldStart = s.start;
      const oldEnd = s.end;
      const newStart = point === 'start' ? newPos : oldStart;
      const newEnd = point === 'end' ? newPos : oldEnd;
      
      // 如果有控制点，按比例调整控制点位置
      let newControl = s.control;
      if (s.control && s.type === 'curve') {
        // 计算控制点相对于起点和终点的参数位置（t值）
        // 对于二次贝塞尔曲线，控制点位置可以表示为起点和终点的线性组合
        const oldDx = oldEnd.x - oldStart.x;
        const oldDy = oldEnd.y - oldStart.y;
        const newDx = newEnd.x - newStart.x;
        const newDy = newEnd.y - newStart.y;
        
        if (Math.abs(oldDx) > 0.001 || Math.abs(oldDy) > 0.001) {
          // 计算控制点相对于起点的偏移比例
          const tX = oldDx !== 0 ? (s.control.x - oldStart.x) / oldDx : 0.5;
          const tY = oldDy !== 0 ? (s.control.y - oldStart.y) / oldDy : 0.5;
          
          // 应用新的比例到新的起点和终点
          newControl = {
            x: newStart.x + tX * newDx,
            y: newStart.y + tY * newDy,
          };
        }
      }
      
      return {
        ...s,
        start: newStart,
        end: newEnd,
        control: newControl,
      };
    }));
  }, []);

  // 切换组可见性
  const toggleGroupVisibility = useCallback((groupId: string) => {
    setGroups(prev => prev.map(g => 
      g.id === groupId ? { ...g, visible: !g.visible } : g
    ));
  }, []);

  // 波形运算（加减 + 每项可乘常数系数，如 A×2 - B×0.5）
  const calculateWaveforms = useCallback((expression: string, terms: CalcTerm[], operators: ('+' | '-')[]) => {
    if (terms.length === 0) return;

    // 获取每一项的点数据和系数
    const termPoints: { scale: number; points: Point[] }[] = [];

    for (const term of terms) {
      const group = groups.find(g => g.id === term.groupId);
      if (!group) return; // 组已被删除，项与运算符会错位，直接放弃

      const groupSegments = segments.filter(s => group.segments.includes(s.id));
      const points: Point[] = [];

      groupSegments.forEach(s => {
        points.push(s.start, s.end);
        if (s.control) points.push(s.control);
      });

      termPoints.push({ scale: term.scale, points });
    }

    // 收集所有x坐标
    const allX = new Set<number>();
    termPoints.forEach(tp => {
      tp.points.forEach(p => allX.add(p.x));
    });
    if (allX.size < 2) return;

    // 计算每个x位置的结果
    const resultPoints: Point[] = [];

    allX.forEach(x => {
      let resultY = interpolateY(x, termPoints[0].points) * termPoints[0].scale;

      // 依次应用运算符
      for (let i = 0; i < operators.length; i++) {
        const nextY = interpolateY(x, termPoints[i + 1].points) * termPoints[i + 1].scale;
        if (operators[i] === '+') {
          resultY += nextY;
        } else {
          resultY -= nextY;
        }
      }

      resultPoints.push({ x, y: resultY });
    });

    resultPoints.sort((a, b) => a.x - b.x);
    
    // 创建新组
    const newGroupId = createGroup(expression);
    
    // 添加线段到新组
    for (let i = 0; i < resultPoints.length - 1; i++) {
      addSegment(resultPoints[i], resultPoints[i + 1], 'line', newGroupId);
    }
  }, [groups, segments, createGroup, addSegment]);

  // 插值获取y值
  const interpolateY = (x: number, points: Point[]): number => {
    points.sort((a, b) => a.x - b.x);
    
    for (let i = 0; i < points.length - 1; i++) {
      if (x >= points[i].x && x <= points[i + 1].x) {
        const t = (x - points[i].x) / (points[i + 1].x - points[i].x);
        return points[i].y + t * (points[i + 1].y - points[i].y);
      }
    }
    
    return points.find(p => p.x === x)?.y || 0;
  };

  // 切换线段选择（用于组内复制）
  const toggleSegmentSelection = useCallback((segmentId: string, isMultiSelect: boolean) => {
    setSelectedSegments((prev: Set<string>) => {
      const newSet = isMultiSelect ? new Set<string>(prev) : new Set<string>();
      if (prev.has(segmentId)) {
        newSet.delete(segmentId);
      } else {
        newSet.add(segmentId);
      }
      return newSet;
    });
  }, []);

  // 清除所有选择
  const clearSegmentSelection = useCallback(() => {
    setSelectedSegments(new Set());
  }, []);

  // 批量删除选中的线段（Delete/Backspace 键）
  const deleteSelectedSegments = useCallback(() => {
    if (selectedSegments.size === 0) return;

    setSegments(prev => prev.filter(s => !selectedSegments.has(s.id)));
    setGroups(prev => prev.map(g => ({
      ...g,
      segments: g.segments.filter(id => !selectedSegments.has(id)),
    })));
    setSelectedSegments(new Set());
    setActiveSegment(null);
    setTimeout(saveToHistory, 0);
  }, [selectedSegments, saveToHistory]);

  // 开始复制模式 - 准备复制选中的线段
  const startCopyMode = useCallback(() => {
    if (selectedSegments.size === 0) return;
    
    const segmentsToCopy = segments.filter(s => selectedSegments.has(s.id));
    if (segmentsToCopy.length === 0) return;
    
    // 创建临时复制的线段（用于拖动预览）
    const tempSegments: LineSegment[] = segmentsToCopy.map(segment => ({
      ...segment,
      id: `temp-${segment.id}`, // 临时ID
    }));
    
    setCopyingSegments(tempSegments);
    setCopyOffset({ x: 0, y: 0 });
  }, [selectedSegments, segments]);

  // 更新复制偏移量
  const updateCopyOffset = useCallback((deltaX: number, deltaY: number) => {
    setCopyOffset({ x: deltaX, y: deltaY });
  }, []);

  // 确认复制 - 将临时线段变为正式线段
  const confirmCopy = useCallback(() => {
    if (copyingSegments.length === 0) return;
    
    // 获取第一个线段的组ID
    const groupId = copyingSegments[0].groupId;
    if (!groupId) return;
    
    const newSegmentIds: string[] = [];
    
    copyingSegments.forEach(segment => {
      const newSegment: LineSegment = {
        id: generateId(),
        start: { x: segment.start.x + copyOffset.x, y: segment.start.y + copyOffset.y },
        end: { x: segment.end.x + copyOffset.x, y: segment.end.y + copyOffset.y },
        type: segment.type,
        groupId: groupId,
      };
      if (segment.control) {
        newSegment.control = { x: segment.control.x + copyOffset.x, y: segment.control.y + copyOffset.y };
      }
      
      setSegments(prev => [...prev, newSegment]);
      newSegmentIds.push(newSegment.id);
      
      // 更新组的线段列表
      setGroups(prev => prev.map(g => 
        g.id === groupId 
          ? { ...g, segments: [...g.segments, newSegment.id] }
          : g
      ));
    });
    
    // 清除复制状态
    setCopyingSegments([]);
    setCopyOffset({ x: 0, y: 0 });
    setCopyStartPoint(null);
    setSelectedSegments(new Set());
    setTimeout(saveToHistory, 0);
  }, [copyingSegments, copyOffset, saveToHistory]);

  // 取消复制
  const cancelCopy = useCallback(() => {
    setCopyingSegments([]);
    setCopyOffset({ x: 0, y: 0 });
    setCopyStartPoint(null);
    setIsDraggingSelected(false);
    setDragStartPoint(null);
  }, []);

  // 拖动移动选中的线段（不复制，只移动）
  const moveSelectedSegments = useCallback((deltaX: number, deltaY: number) => {
    if (selectedSegments.size === 0) return;
    
    // 吸附到最小格点
    const snapDeltaX = Math.round(deltaX / axisConfig.xGridSize) * axisConfig.xGridSize;
    const snapDeltaY = Math.round(deltaY / axisConfig.yGridSize) * axisConfig.yGridSize;
    
    if (snapDeltaX === 0 && snapDeltaY === 0) return;
    
    setSegments(prev => prev.map(s => {
      if (!selectedSegments.has(s.id)) return s;
      return {
        ...s,
        start: { x: s.start.x + snapDeltaX, y: s.start.y + snapDeltaY },
        end: { x: s.end.x + snapDeltaX, y: s.end.y + snapDeltaY },
        control: s.control ? { x: s.control.x + snapDeltaX, y: s.control.y + snapDeltaY } : undefined,
      };
    }));
  }, [selectedSegments, axisConfig.xGridSize, axisConfig.yGridSize]);

  // 完成移动选中的线段（保存历史）
  const finishMoveSelectedSegments = useCallback(() => {
    if (selectedSegments.size > 0) {
      saveToHistory();
    }
    setIsDraggingSelected(false);
    setDragStartPoint(null);
  }, [selectedSegments.size, saveToHistory]);

  // Ctrl+C：将选中的线段复制到剪贴板
  const copyToClipboard = useCallback(() => {
    if (selectedSegments.size === 0) return;
    
    const segmentsToCopy = segments.filter(s => selectedSegments.has(s.id));
    if (segmentsToCopy.length === 0) return;
    
    setClipboardSegments(segmentsToCopy);
  }, [selectedSegments, segments]);

  // Ctrl+V：进入复制预览模式（从剪贴板）
  const enterCopyPreview = useCallback((originPoint: Point) => {
    if (clipboardSegments.length === 0) return;
    
    // 创建临时复制的线段（用于预览）
    const tempSegments: LineSegment[] = clipboardSegments.map(segment => ({
      ...segment,
      id: `preview-${segment.id}`, // 预览ID
    }));
    
    setCopyingSegments(tempSegments);
    // 初始偏移设为0，预览线将画在原位置（红色虚线可区分）
    setCopyPreviewOffset({ x: 0, y: 0 });
    setCopyOffset({ x: 0, y: 0 });
    setCopyPreviewOrigin(originPoint);
    setIsCopyPreview(true);
  }, [clipboardSegments]);

  // 更新复制预览偏移量
  const updateCopyPreviewOffset = useCallback((mousePos: Point) => {
    if (!copyPreviewOrigin) return;
    
    const rawDeltaX = mousePos.x - copyPreviewOrigin.x;
    const rawDeltaY = mousePos.y - copyPreviewOrigin.y;
    
    // 吸附到最小格点
    const snapDeltaX = Math.round(rawDeltaX / axisConfig.xGridSize) * axisConfig.xGridSize;
    const snapDeltaY = Math.round(rawDeltaY / axisConfig.yGridSize) * axisConfig.yGridSize;
    
    setCopyPreviewOffset({ x: snapDeltaX, y: snapDeltaY });
    setCopyOffset({ x: snapDeltaX, y: snapDeltaY });
  }, [copyPreviewOrigin, axisConfig.xGridSize, axisConfig.yGridSize]);

  // 确认复制预览 - 将预览线段变为正式线段
  const confirmCopyPreview = useCallback(() => {
    if (copyingSegments.length === 0) return;
    
    const newSegmentIds: string[] = [];
    
    copyingSegments.forEach(segment => {
      const newSegment: LineSegment = {
        id: generateId(),
        start: { x: segment.start.x + copyPreviewOffset.x, y: segment.start.y + copyPreviewOffset.y },
        end: { x: segment.end.x + copyPreviewOffset.x, y: segment.end.y + copyPreviewOffset.y },
        type: segment.type,
        groupId: segment.groupId,
      };
      if (segment.control) {
        newSegment.control = { x: segment.control.x + copyPreviewOffset.x, y: segment.control.y + copyPreviewOffset.y };
      }
      
      setSegments(prev => [...prev, newSegment]);
      newSegmentIds.push(newSegment.id);
      
      // 更新组的线段列表
      setGroups(prev => prev.map(g => 
        g.id === segment.groupId 
          ? { ...g, segments: [...g.segments, newSegment.id] }
          : g
      ));
    });
    
    // 清除复制预览状态
    setIsCopyPreview(false);
    setCopyingSegments([]);
    setCopyPreviewOffset({ x: 0, y: 0 });
    setCopyOffset({ x: 0, y: 0 });
    setCopyPreviewOrigin(null);
    setSelectedSegments(new Set());
    setTimeout(saveToHistory, 0);
  }, [copyingSegments, copyPreviewOffset, saveToHistory]);

  // 取消复制预览
  const cancelCopyPreview = useCallback(() => {
    setIsCopyPreview(false);
    setCopyingSegments([]);
    setCopyPreviewOffset({ x: 0, y: 0 });
    setCopyOffset({ x: 0, y: 0 });
    setCopyPreviewOrigin(null);
  }, []);

  // 复制选中的线段到同一组（组内复制）- 保留用于向后兼容
  const duplicateSelectedSegments = useCallback(() => {
    if (selectedSegments.size === 0) return;
    
    const segmentsToCopy = segments.filter(s => selectedSegments.has(s.id));
    if (segmentsToCopy.length === 0) return;
    
    // 获取第一个线段的组ID
    const groupId = segmentsToCopy[0].groupId;
    if (!groupId) return;
    
    // 计算偏移（向右偏移2个格点单位）
    const offsetX = axisConfig.xGridSize * 2;
    
    segmentsToCopy.forEach(segment => {
      const newSegment: LineSegment = {
        id: generateId(),
        start: { x: segment.start.x + offsetX, y: segment.start.y },
        end: { x: segment.end.x + offsetX, y: segment.end.y },
        type: segment.type,
        groupId: groupId,
      };
      if (segment.control) {
        newSegment.control = { x: segment.control.x + offsetX, y: segment.control.y };
      }
      
      setSegments(prev => [...prev, newSegment]);
      
      // 更新组的线段列表
      setGroups(prev => prev.map(g => 
        g.id === groupId 
          ? { ...g, segments: [...g.segments, newSegment.id] }
          : g
      ));
    });
    
    // 清除选择
    setSelectedSegments(new Set());
    setTimeout(saveToHistory, 0);
  }, [selectedSegments, segments, axisConfig.xGridSize, saveToHistory]);

  // 清空所有
  const clearAll = useCallback(() => {
    setSegments([]);
    setGroups([]);
    setSelectedGroup(null);
    setActiveSegment(null);
    setTimeout(saveToHistory, 0);
    setSelectedSegments(new Set());
  }, [saveToHistory]);

  // 导出为SVG（范围自动取可见波形的包围盒，向外对齐到主格点）
  const exportToSVG = useCallback((): string => {
    const padding = 60;

    // 计算可见线段的包围盒
    const visibleSegments = segments.filter(s => {
      const g = groups.find(g => g.id === s.groupId);
      return !g || g.visible;
    });

    let xMin = -10, xMax = 10, yMin = -5, yMax = 5; // 无波形时的默认范围
    if (visibleSegments.length > 0) {
      xMin = Infinity; xMax = -Infinity; yMin = Infinity; yMax = -Infinity;
      visibleSegments.forEach(s => {
        const pts = s.control ? [s.start, s.end, s.control] : [s.start, s.end];
        pts.forEach(p => {
          xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x);
          yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y);
        });
      });
      // 向外对齐到主格点，并各留一格空隙
      xMin = (Math.floor(xMin / axisConfig.xMajorGridSize) - 1) * axisConfig.xMajorGridSize;
      xMax = (Math.ceil(xMax / axisConfig.xMajorGridSize) + 1) * axisConfig.xMajorGridSize;
      yMin = (Math.floor(yMin / axisConfig.yMajorGridSize) - 1) * axisConfig.yMajorGridSize;
      yMax = (Math.ceil(yMax / axisConfig.yMajorGridSize) + 1) * axisConfig.yMajorGridSize;
    }

    const xRange = xMax - xMin;
    const yRange = yMax - yMin;
    // 每世界单位像素数：默认40，范围太大时压缩，保证导出图不超过约2000px
    const pxPerUnit = Math.min(40, 1880 / xRange, 1880 / yRange);
    const width = Math.round(2 * padding + xRange * pxPerUnit);
    const height = Math.round(2 * padding + yRange * pxPerUnit);
    const chartWidth = width - 2 * padding;
    const chartHeight = height - 2 * padding;

    // 坐标转换函数
    const worldToSVG = (point: Point): Point => ({
      x: padding + ((point.x - xMin) / xRange) * chartWidth,
      y: height - padding - ((point.y - yMin) / yRange) * chartHeight,
    });

    // 生成SVG路径
    const generatePath = (segment: LineSegment): string => {
      const start = worldToSVG(segment.start);
      const end = worldToSVG(segment.end);
      
      if (segment.type === 'curve' && segment.control) {
        const control = worldToSVG(segment.control);
        return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} Q ${control.x.toFixed(2)} ${control.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
      }
      return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} L ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
    };



    // 构建SVG内容
    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <style>
      .grid-line-minor { stroke: #e5e7eb; stroke-width: 1; }
      .grid-line-major { stroke: #6b7280; stroke-width: 2; }
      .axis-line { stroke: #000000; stroke-width: 3; }
      .axis-text { font-family: sans-serif; font-size: 13px; font-weight: bold; fill: #1f2937; }
      .axis-label { font-family: sans-serif; font-size: 16px; font-weight: bold; fill: #000000; }
    </style>
  </defs>
  
  <!-- 背景 -->
  <rect width="${width}" height="${height}" fill="white"/>
  
  <!-- 次网格线（虚线） -->
  <g class="grid-minor">
`;

    // 用整数索引循环避免浮点累加误差
    const isMajor = (v: number, major: number) =>
      Math.abs(v / major - Math.round(v / major)) < 1e-6;

    // 垂直次网格线
    for (let i = Math.ceil(xMin / axisConfig.xGridSize); i * axisConfig.xGridSize <= xMax + 1e-9; i++) {
      const x = i * axisConfig.xGridSize;
      if (isMajor(x, axisConfig.xMajorGridSize)) continue;
      const screenX = worldToSVG({ x, y: 0 }).x;
      svg += `    <line class="grid-line-minor" x1="${screenX.toFixed(2)}" y1="${padding}" x2="${screenX.toFixed(2)}" y2="${height - padding}"/>\n`;
    }

    // 水平次网格线
    for (let i = Math.ceil(yMin / axisConfig.yGridSize); i * axisConfig.yGridSize <= yMax + 1e-9; i++) {
      const y = i * axisConfig.yGridSize;
      if (isMajor(y, axisConfig.yMajorGridSize)) continue;
      const screenY = worldToSVG({ x: 0, y }).y;
      svg += `    <line class="grid-line-minor" x1="${padding}" y1="${screenY.toFixed(2)}" x2="${width - padding}" y2="${screenY.toFixed(2)}"/>\n`;
    }

    svg += `  </g>

  <!-- 主网格线 -->
  <g class="grid-major">
`;

    // 垂直主网格线
    const xMajorIndexStart = Math.ceil(xMin / axisConfig.xMajorGridSize);
    const xMajorIndexEnd = Math.floor(xMax / axisConfig.xMajorGridSize + 1e-9);
    for (let i = xMajorIndexStart; i <= xMajorIndexEnd; i++) {
      const screenX = worldToSVG({ x: i * axisConfig.xMajorGridSize, y: 0 }).x;
      svg += `    <line class="grid-line-major" x1="${screenX.toFixed(2)}" y1="${padding}" x2="${screenX.toFixed(2)}" y2="${height - padding}"/>\n`;
    }

    // 水平主网格线
    const yMajorIndexStart = Math.ceil(yMin / axisConfig.yMajorGridSize);
    const yMajorIndexEnd = Math.floor(yMax / axisConfig.yMajorGridSize + 1e-9);
    for (let i = yMajorIndexStart; i <= yMajorIndexEnd; i++) {
      const screenY = worldToSVG({ x: 0, y: i * axisConfig.yMajorGridSize }).y;
      svg += `    <line class="grid-line-major" x1="${padding}" y1="${screenY.toFixed(2)}" x2="${width - padding}" y2="${screenY.toFixed(2)}"/>\n`;
    }

    svg += `  </g>

  <!-- 坐标轴 -->
  <g class="axes">
`;

    // 坐标轴只在原点落在范围内时绘制；不在范围内时刻度标签贴边显示
    const hasXAxis = yMin <= 0 && yMax >= 0;
    const hasYAxis = xMin <= 0 && xMax >= 0;
    const originY = hasXAxis ? worldToSVG({ x: 0, y: 0 }).y : height - padding;
    const originX = hasYAxis ? worldToSVG({ x: 0, y: 0 }).x : padding;

    if (hasXAxis) {
      svg += `    <line class="axis-line" x1="${padding}" y1="${originY.toFixed(2)}" x2="${width - padding}" y2="${originY.toFixed(2)}"/>\n`;
    }
    if (hasYAxis) {
      svg += `    <line class="axis-line" x1="${originX.toFixed(2)}" y1="${padding}" x2="${originX.toFixed(2)}" y2="${height - padding}"/>\n`;
    }

    svg += `  </g>

  <!-- 刻度标签（主格点） -->
  <g class="tick-labels">
`;

    // X轴刻度（主格点）
    for (let i = xMajorIndexStart; i <= xMajorIndexEnd; i++) {
      const x = i * axisConfig.xMajorGridSize;
      if (Math.abs(x) < 0.001 && hasXAxis && hasYAxis) continue; // 原点不标数字
      const screenX = worldToSVG({ x, y: 0 }).x;
      const label = Number.isInteger(x) ? x.toString() : x.toFixed(1);
      svg += `    <text class="axis-text" x="${screenX.toFixed(2)}" y="${(originY + 20).toFixed(2)}" text-anchor="middle">${label}</text>\n`;
    }

    // Y轴刻度（主格点）
    for (let i = yMajorIndexStart; i <= yMajorIndexEnd; i++) {
      const y = i * axisConfig.yMajorGridSize;
      if (Math.abs(y) < 0.001 && hasXAxis && hasYAxis) continue;
      const screenY = worldToSVG({ x: 0, y }).y;
      const label = Number.isInteger(y) ? y.toString() : y.toFixed(1);
      svg += `    <text class="axis-text" x="${(originX - 10).toFixed(2)}" y="${(screenY + 4).toFixed(2)}" text-anchor="end">${label}</text>\n`;
    }

    svg += `  </g>

  <!-- 轴标签 -->
  <g class="axis-labels">
    <text class="axis-label" x="${(width - padding + 20).toFixed(2)}" y="${(originY + 5).toFixed(2)}" text-anchor="middle">${axisConfig.xUnit}</text>
    <text class="axis-label" x="${(originX - 25).toFixed(2)}" y="${(padding - 20).toFixed(2)}" text-anchor="middle">${axisConfig.yUnit}</text>
  </g>

  <!-- 波形线段 -->
  <g class="waveforms">
`;

    segments.forEach(segment => {
      const group = groups.find(g => g.id === segment.groupId);
      if (group && !group.visible) return;
      
      const path = generatePath(segment);
      const color = group?.color || '#3b82f6';
      svg += `    <path d="${path}" stroke="${color}" stroke-width="2" fill="none"/>\n`;
    });

    svg += `  </g>
</svg>`;

    return svg;
  }, [segments, groups, axisConfig]);

  // 下载SVG文件
  const downloadSVG = useCallback((filename: string = 'waveform.svg') => {
    const svg = exportToSVG();
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [exportToSVG]);

  // 导出波形数据为JSON对象
  const exportData = useCallback(() => {
    return {
      version: '2.0',
      exportTime: new Date().toISOString(),
      axisConfig,
      viewport,
      groups,
      segments,
    };
  }, [axisConfig, viewport, groups, segments]);

  // 下载JSON文件
  const downloadJSON = useCallback((filename: string = 'waveform.json') => {
    const data = exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [exportData]);

  // 导入波形数据（兼容 1.0 版：忽略旧的 xMin/xMax/yMin/yMax/zoom 字段）
  const importData = useCallback((data: {
    version?: string;
    axisConfig?: Partial<AxisConfig>;
    viewport?: Partial<Viewport>;
    groups?: WaveformGroup[];
    segments?: LineSegment[];
  }) => {
    // 导入坐标配置（如果存在），只提取当前版本认识的字段
    if (data.axisConfig) {
      const a = data.axisConfig;
      setAxisConfig({
        xUnit: a.xUnit ?? 't',
        yUnit: a.yUnit ?? 'A',
        xGridSize: a.xGridSize || 0.5,
        yGridSize: a.yGridSize || 0.5,
        xMajorGridSize: a.xMajorGridSize || 2,
        yMajorGridSize: a.yMajorGridSize || 2,
      });
    }

    // 恢复视口（2.0 版才有；旧文件保持当前视口）
    if (data.viewport) {
      const v = data.viewport;
      setViewport({
        centerX: v.centerX ?? 0,
        centerY: v.centerY ?? 0,
        scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale || BASE_SCALE)),
      });
    }
    
    // 导入组和线段
    if (data.groups && data.segments) {
      setGroups(data.groups);
      setSegments(data.segments);
    }
    
    // 清除选择状态
    setSelectedGroup(null);
    setSelectedSegments(new Set());
    setActiveSegment(null);
    setTimeout(saveToHistory, 0);
  }, [saveToHistory]);

  // 生成常用波形
  const generateWaveform = useCallback((
    type: WaveformType,
    params: {
      amplitude: number;
      period: number;
      dutyCycle: number;
      totalCycles: number;
      startTime: number;
      phaseShift: number;
    },
    groupName: string,
    customColor?: string,
    skipHistorySave?: boolean
  ) => {
    const { amplitude, period, dutyCycle, totalCycles, startTime, phaseShift } = params;
    const phaseOffset = (phaseShift / 360) * period; // 转换为时间偏移
    
    // 创建新组
    const newGroupId = generateId();
    const newGroup: WaveformGroup = {
      id: newGroupId,
      name: groupName,
      color: customColor || getNextColor(),
      visible: true,
      segments: [],
    };
    
    const newSegments: LineSegment[] = [];
    const newSegmentIds: string[] = [];
    
    // 生成关键点，然后用线段连接
    const points: Point[] = [];
    
    if (type === 'square') {
      // 方波：用关键点生成（横线+竖线）
      // 每个周期：低电平起点 -> 上升沿 -> 高电平 -> 下降沿 -> 低电平
      const dutyTime = (dutyCycle / 100) * period;
      const lowLevel = -amplitude;
      const highLevel = amplitude;
      
      for (let cycle = 0; cycle < totalCycles; cycle++) {
        const cycleStart = startTime + cycle * period + phaseOffset;
        
        // 周期起点（低电平）
        points.push({ x: cycleStart, y: lowLevel });
        // 上升沿起点（低电平）
        points.push({ x: cycleStart, y: lowLevel });
        // 上升沿终点（高电平）
        points.push({ x: cycleStart, y: highLevel });
        // 高电平终点
        points.push({ x: cycleStart + dutyTime, y: highLevel });
        // 下降沿终点（低电平）
        points.push({ x: cycleStart + dutyTime, y: lowLevel });
        // 周期终点（低电平）
        points.push({ x: cycleStart + period, y: lowLevel });
      }
    } else if (type === 'ramp') {
      // Ramp波（电感电流波形）：上升沿 + 下降沿
      // 占空比控制上升沿时间
      const riseTime = (dutyCycle / 100) * period;
      const lowLevel = 0; // 从0开始
      const highLevel = amplitude;
      
      for (let cycle = 0; cycle < totalCycles; cycle++) {
        const cycleStart = startTime + cycle * period + phaseOffset;
        
        // 周期起点（低电平）
        points.push({ x: cycleStart, y: lowLevel });
        // 上升沿终点（峰值）
        points.push({ x: cycleStart + riseTime, y: highLevel });
        // 下降沿终点（回到低电平）
        points.push({ x: cycleStart + period, y: lowLevel });
      }
    } else if (type === 'sine') {
      // 正弦波：采样点连接
      const samplesPerPeriod = 20;
      const totalSamples = Math.ceil(samplesPerPeriod * totalCycles);
      const dt = period / samplesPerPeriod;
      const phaseRad = (phaseShift * Math.PI) / 180;
      
      for (let i = 0; i <= totalSamples; i++) {
        const t = startTime + i * dt;
        const normalizedT = ((t - startTime) / period) * 2 * Math.PI + phaseRad;
        const y = amplitude * Math.sin(normalizedT);
        points.push({ x: t, y });
      }
    }
    
    // 将点连接成线段
    for (let i = 0; i < points.length - 1; i++) {
      const newSegment: LineSegment = {
        id: generateId(),
        start: points[i],
        end: points[i + 1],
        type: 'line',
        groupId: newGroupId,
      };
      newSegments.push(newSegment);
      newSegmentIds.push(newSegment.id);
    }
    
    newGroup.segments = newSegmentIds;
    
    setSegments(prev => [...prev, ...newSegments]);
    setGroups(prev => [...prev, newGroup]);
    setSelectedGroup(newGroupId);
    if (!skipHistorySave) {
      setTimeout(saveToHistory, 0);
    }
  }, [saveToHistory, getNextColor]);

  return {
    segments,
    groups,
    selectedSegments,
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
    copyStartPoint,
    isDraggingSelected,
    dragStartPoint,
    isCopyPreview,
    copyPreviewOffset,
    copyPreviewOrigin,
    clipboardSegments,
    saveToHistory,
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
    setCopyStartPoint,
    setCopyingSegments,
    setCopyOffset,
    setClipboardSegments,
    setIsDraggingSelected,
    setDragStartPoint,
    setIsCopyPreview,
    setCopyPreviewOffset,
    setCopyPreviewOrigin,
    worldToScreen,
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
    deleteSelectedSegments,
    duplicateSelectedSegments,
    startCopyMode,
    updateCopyOffset,
    confirmCopy,
    cancelCopy,
    moveSelectedSegments,
    finishMoveSelectedSegments,
    copyToClipboard,
    enterCopyPreview,
    updateCopyPreviewOffset,
    confirmCopyPreview,
    cancelCopyPreview,
    calculateWaveforms,
    clearAll,
    undo,
    redo,
    exportToSVG,
    downloadSVG,
    exportData,
    downloadJSON,
    importData,
    generateWaveform,
  };
}
