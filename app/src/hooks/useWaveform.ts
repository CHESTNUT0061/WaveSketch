import { useState, useCallback, useRef, useEffect } from 'react';
import type { Point, LineSegment, WaveformGroup, AxisConfig, Viewport, CalcRpnToken, ToolMode } from '@/types/waveform';
import type { WaveformType } from '@/components/WaveformGenerator';

const generateId = () => Math.random().toString(36).slice(2, 11);

// Base scale: pixels per world unit at 100% zoom
export const BASE_SCALE = 40;
export const MIN_SCALE = BASE_SCALE * 0.1;  // 10%
export const MAX_SCALE = BASE_SCALE * 10;   // 1000%

const DEFAULT_VIEWPORT: Viewport = { centerX: 0, centerY: 0, scale: BASE_SCALE };

const DEFAULT_AXIS_CONFIG: AxisConfig = {
  xUnit: 't',
  yUnit: 'A',
  xGridSize: 0.5,      // minor grid (snap unit)
  yGridSize: 0.5,
  xMajorGridSize: 2,   // major grid (numbered)
  yMajorGridSize: 2,
};

// Escape XML text (group names / unit labels may contain special chars)
const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// localStorage autosave
const DRAFT_KEY = 'waveform-draft-v1';

interface Draft {
  segments: LineSegment[];
  groups: WaveformGroup[];
  axisConfig?: Partial<AxisConfig>;
  viewport?: Partial<Viewport>;
}

function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!Array.isArray(d.segments) || !Array.isArray(d.groups)) return null;
    return d as Draft;
  } catch {
    return null;
  }
}

const COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
];

// History snapshot
interface HistoryState {
  segments: LineSegment[];
  groups: WaveformGroup[];
}

export function useWaveform() {
  // Restore the draft from localStorage on load (read once)
  const [draft] = useState(loadDraft);

  const [segments, setSegments] = useState<LineSegment[]>(draft?.segments ?? []);
  const [groups, setGroups] = useState<WaveformGroup[]>(draft?.groups ?? []);

  // Undo/redo history - kept in refs to avoid stale closures; the restored draft is the undo baseline
  const historyRef = useRef<HistoryState[]>([{ segments: draft?.segments ?? [], groups: draft?.groups ?? [] }]);
  const historyIndexRef = useRef<number>(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  
  // Refs mirroring the latest state
  const segmentsRef = useRef<LineSegment[]>([]);
  const groupsRef = useRef<WaveformGroup[]>([]);
  
  // Keep refs in sync with state
  segmentsRef.current = segments;
  groupsRef.current = groups;
  
  // Update undo/redo availability
  const updateHistoryState = useCallback(() => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);
  
  const [axisConfig, setAxisConfig] = useState<AxisConfig>(() =>
    draft?.axisConfig ? { ...DEFAULT_AXIS_CONFIG, ...draft.axisConfig } : DEFAULT_AXIS_CONFIG
  );
  // Infinite-canvas viewport (pan center + scale)
  const [viewport, setViewport] = useState<Viewport>(() =>
    draft?.viewport
      ? {
          centerX: draft.viewport.centerX ?? 0,
          centerY: draft.viewport.centerY ?? 0,
          scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, draft.viewport.scale || BASE_SCALE)),
        }
      : DEFAULT_VIEWPORT
  );

  // Autosave the draft to localStorage (500ms debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ segments, groups, axisConfig, viewport }));
      } catch {
        // Fail silently if storage is full or disabled
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [segments, groups, axisConfig, viewport]);
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

  // Copy-mode state
  const [copyingSegments, setCopyingSegments] = useState<LineSegment[]>([]); // segments being dragged as a copy
  const [copyOffset, setCopyOffset] = useState<Point>({ x: 0, y: 0 }); // copy offset
  const [isDraggingSelected, setIsDraggingSelected] = useState(false); // whether the selection is being dragged
  const [dragStartPoint, setDragStartPoint] = useState<Point | null>(null); // drag start point

  // Paste-preview state for select mode
  const [isCopyPreview, setIsCopyPreview] = useState(false); // whether the paste preview is active
  const [copyPreviewOffset, setCopyPreviewOffset] = useState<Point>({ x: 0, y: 0 }); // paste preview offset
  const [copyPreviewOrigin, setCopyPreviewOrigin] = useState<Point | null>(null); // paste preview reference origin
  const [clipboardSegments, setClipboardSegments] = useState<LineSegment[]>([]); // clipboard segments (Ctrl+C)

  // Save the current state as a new history step
  const saveToHistory = useCallback(() => {
    // Read the latest state via refs to avoid stale closures
    const newState: HistoryState = {
      segments: JSON.parse(JSON.stringify(segmentsRef.current)),
      groups: JSON.parse(JSON.stringify(groupsRef.current)),
    };
    
    // Drop any redo entries beyond the current index
    const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    newHistory.push(newState);
    
    // Cap history at 50 steps
    if (newHistory.length > 50) {
      newHistory.shift();
    }
    
    historyRef.current = newHistory;
    historyIndexRef.current = newHistory.length - 1;
    updateHistoryState();
  }, [updateHistoryState]);

  // Undo
  const undo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      const prevState = historyRef.current[historyIndexRef.current];
      setSegments(JSON.parse(JSON.stringify(prevState.segments)));
      setGroups(JSON.parse(JSON.stringify(prevState.groups)));
      updateHistoryState();
    }
  }, [updateHistoryState]);

  // Redo
  const redo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      const nextState = historyRef.current[historyIndexRef.current];
      setSegments(JSON.parse(JSON.stringify(nextState.segments)));
      setGroups(JSON.parse(JSON.stringify(nextState.groups)));
      updateHistoryState();
    }
  }, [updateHistoryState]);

  // World -> screen (CSS pixels), centered on the viewport.
  // Uses clientWidth/Height because the canvas backing store is scaled by devicePixelRatio.
  const worldToScreen = useCallback((point: Point, canvas: HTMLCanvasElement): Point => {
    return {
      x: canvas.clientWidth / 2 + (point.x - viewport.centerX) * viewport.scale,
      y: canvas.clientHeight / 2 - (point.y - viewport.centerY) * viewport.scale,
    };
  }, [viewport]);

  // Screen (CSS pixels) -> world
  const screenToWorld = useCallback((point: Point, canvas: HTMLCanvasElement): Point => {
    return {
      x: viewport.centerX + (point.x - canvas.clientWidth / 2) / viewport.scale,
      y: viewport.centerY - (point.y - canvas.clientHeight / 2) / viewport.scale,
    };
  }, [viewport]);

  // Snap to grid
  const snapToGrid = useCallback((point: Point): Point => {
    return {
      x: Math.round(point.x / axisConfig.xGridSize) * axisConfig.xGridSize,
      y: Math.round(point.y / axisConfig.yGridSize) * axisConfig.yGridSize,
    };
  }, [axisConfig]);

  // Add a segment (internal, no history entry)
  const addSegmentInternal = useCallback((start: Point, end: Point, type: 'line' | 'curve' = 'line', targetGroupId?: string): string => {
    let effectiveGroupId = targetGroupId || selectedGroup;
    
    // Create a default group when none is selected
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
    
    // Update the group's segment list
    setGroups(prev => prev.map(g => 
      g.id === effectiveGroupId 
        ? { ...g, segments: [...g.segments, newSegment.id] }
        : g
    ));
    
    return newSegment.id;
  }, [selectedGroup, groups]);

  // Add a segment (public, saves history)
  const addSegment = useCallback((start: Point, end: Point, type: 'line' | 'curve' = 'line', targetGroupId?: string) => {
    const id = addSegmentInternal(start, end, type, targetGroupId);
    // Defer the save until the new state has committed
    setTimeout(() => saveToHistory(), 0);
    return id;
  }, [addSegmentInternal, saveToHistory]);

  // Update a segment's control point (curve)
  const updateControlPoint = useCallback((segmentId: string, control: Point) => {
    setSegments(prev => prev.map(s => 
      s.id === segmentId ? { ...s, control, type: 'curve' } : s
    ));
  }, []);

  // Add a control point to a segment
  const addControlPoint = useCallback((segmentId: string, controlPoint: Point) => {
    setSegments(prev => prev.map(s => 
      s.id === segmentId ? { ...s, control: controlPoint, type: 'curve' } : s
    ));
    setTimeout(saveToHistory, 0);
  }, [saveToHistory]);

  // Delete a segment
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

  // Next available color
  const getNextColor = useCallback((): string => {
    // colors already in use
    const usedColors = new Set(groups.map(g => g.color));
    // first unused color
    for (const color of COLORS) {
      if (!usedColors.has(color)) {
        return color;
      }
    }
    // Cycle when all colors are used
    return COLORS[groups.length % COLORS.length];
  }, [groups]);

  // Create a group
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

  // Change a group's color
  const changeGroupColor = useCallback((groupId: string, color: string) => {
    setGroups(prev => prev.map(g => 
      g.id === groupId ? { ...g, color } : g
    ));
  }, []);

  // Delete a group
  const deleteGroup = useCallback((groupId: string) => {
    // Segment ids belonging to the group
    const group = groups.find(g => g.id === groupId);
    const segmentIdsToDelete = group?.segments || [];
    // Delete all of the group's segments
    setSegments(prev => prev.filter(s => !segmentIdsToDelete.includes(s.id)));
    // Delete a group
    setGroups(prev => prev.filter(g => g.id !== groupId));
    if (selectedGroup === groupId) {
      setSelectedGroup(null);
    }
    setTimeout(saveToHistory, 0);
  }, [saveToHistory, selectedGroup, groups]);

  // Rename a group
  const renameGroup = useCallback((groupId: string, newName: string) => {
    if (!newName.trim()) return;
    setGroups(prev => prev.map(g => 
      g.id === groupId ? { ...g, name: newName.trim() } : g
    ));
  }, []);

  // Duplicate a group
  const duplicateGroup = useCallback((groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    
    const groupSegments = segments.filter(s => group.segments.includes(s.id));
    if (groupSegments.length === 0) return;
    
    // Create the new group
    const newGroupId = generateId();
    const newGroup: WaveformGroup = {
      id: newGroupId,
      name: `${group.name} 副本`,
      color: COLORS[groups.length % COLORS.length],
      visible: true,
      segments: [],
    };
    
    // Copy segments (shifted right by two grid units)
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

  // Move a group (grid-snapped)
  const moveGroup = useCallback((groupId: string, deltaX: number, deltaY: number) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    
    // Snap to the minor grid
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

  // Finish moving a group (saves history)
  const finishMoveGroup = useCallback(() => {
    saveToHistory();
    setMovingGroup(null);
    setMoveStartPoint(null);
  }, [saveToHistory]);

  // Move one endpoint of a segment. Generated waveforms are chains of connected
  // segments that share vertices, so we move every endpoint in the same group that
  // coincides with the dragged one — otherwise the chain would tear at the seam.
  const moveSegmentEndpoint = useCallback((segmentId: string, point: 'start' | 'end', newPos: Point) => {
    setSegments(prev => {
      const target = prev.find(s => s.id === segmentId);
      if (!target) return prev;

      const anchor = point === 'start' ? target.start : target.end;
      const groupId = target.groupId;
      const coincides = (p: Point) =>
        Math.abs(p.x - anchor.x) < 1e-6 && Math.abs(p.y - anchor.y) < 1e-6;

      // Rescale a curve's control point when its endpoints move
      const rescaleControl = (s: LineSegment, newStart: Point, newEnd: Point): Point | undefined => {
        if (!s.control || s.type !== 'curve') return s.control;
        const oldDx = s.end.x - s.start.x;
        const oldDy = s.end.y - s.start.y;
        const newDx = newEnd.x - newStart.x;
        const newDy = newEnd.y - newStart.y;
        if (Math.abs(oldDx) < 0.001 && Math.abs(oldDy) < 0.001) return s.control;
        const tX = oldDx !== 0 ? (s.control.x - s.start.x) / oldDx : 0.5;
        const tY = oldDy !== 0 ? (s.control.y - s.start.y) / oldDy : 0.5;
        return { x: newStart.x + tX * newDx, y: newStart.y + tY * newDy };
      };

      return prev.map(s => {
        // Only weld vertices within the same group (or ungrouped drags of a lone segment)
        if (s.groupId !== groupId) return s;
        const moveStart = coincides(s.start);
        const moveEnd = coincides(s.end);
        if (!moveStart && !moveEnd) return s;
        const newStart = moveStart ? newPos : s.start;
        const newEnd = moveEnd ? newPos : s.end;
        return { ...s, start: newStart, end: newEnd, control: rescaleControl(s, newStart, newEnd) };
      });
    });
  }, []);

  // Toggle group visibility
  const toggleGroupVisibility = useCallback((groupId: string) => {
    setGroups(prev => prev.map(g => 
      g.id === groupId ? { ...g, visible: !g.visible } : g
    ));
  }, []);

  // Waveform expression evaluation (RPN; supports +, -, x, parentheses, constants, e.g. (A + B) x 0.5 - 1)
  const calculateExpression = useCallback((expression: string, rpn: CalcRpnToken[]) => {
    if (rpn.length === 0) return;

    // Collect point data of the referenced groups (sorted by x, true unsnapped values)
    const groupPointsMap = new Map<string, Point[]>();
    for (const tk of rpn) {
      if (tk.t === 'g' && !groupPointsMap.has(tk.id)) {
        const group = groups.find(g => g.id === tk.id);
        if (!group) return; // a referenced group was deleted; abort

        const points: Point[] = [];
        segments.filter(s => group.segments.includes(s.id)).forEach(s => {
          points.push(s.start, s.end);
          if (s.control) points.push(s.control);
        });
        points.sort((a, b) => a.x - b.x);
        groupPointsMap.set(tk.id, points);
      }
    }
    if (groupPointsMap.size === 0) return;

    // Union of all x coords, near-duplicates merged by tolerance (avoids sliver segments from float error)
    const xs: number[] = [];
    groupPointsMap.forEach(pts => pts.forEach(p => xs.push(p.x)));
    xs.sort((a, b) => a - b);
    const uniqX: number[] = [];
    for (const x of xs) {
      if (uniqX.length === 0 || x - uniqX[uniqX.length - 1] > 1e-9) uniqX.push(x);
    }
    if (uniqX.length < 2) return;

    // With waveform x waveform (e.g. instantaneous power V x I) the result is piecewise quadratic;
    // sampling only at endpoints would distort it - add 2 extra samples per interval
    const typeStack: boolean[] = [];
    let hasWaveMul = false;
    for (const tk of rpn) {
      if (tk.t === 'g') typeStack.push(true);
      else if (tk.t === 'c') typeStack.push(false);
      else {
        const b = typeStack.pop() ?? false;
        const a = typeStack.pop() ?? false;
        if (tk.v === '×' && a && b) hasWaveMul = true;
        typeStack.push(a || b);
      }
    }
    let sampleXs = uniqX;
    if (hasWaveMul) {
      sampleXs = [];
      for (let i = 0; i < uniqX.length - 1; i++) {
        sampleXs.push(uniqX[i]);
        sampleXs.push(uniqX[i] + (uniqX[i + 1] - uniqX[i]) / 3);
        sampleXs.push(uniqX[i] + (2 * (uniqX[i + 1] - uniqX[i])) / 3);
      }
      sampleXs.push(uniqX[uniqX.length - 1]);
    }

    // RPN evaluation
    const evalAt = (x: number): number => {
      const st: number[] = [];
      for (const tk of rpn) {
        if (tk.t === 'g') {
          st.push(interpolateY(x, groupPointsMap.get(tk.id)!));
        } else if (tk.t === 'c') {
          st.push(tk.v);
        } else {
          const b = st.pop() ?? 0;
          const a = st.pop() ?? 0;
          st.push(tk.v === '+' ? a + b : tk.v === '-' ? a - b : a * b);
        }
      }
      return st[0] ?? 0;
    };

    const resultPoints = sampleXs.map(x => ({ x, y: evalAt(x) })).filter(p => Number.isFinite(p.y));
    if (resultPoints.length < 2) return;

    // Build the group and segments directly and commit once (a single history entry)
    const newGroupId = generateId();
    const newSegments: LineSegment[] = [];
    for (let i = 0; i < resultPoints.length - 1; i++) {
      const start = resultPoints[i];
      const end = resultPoints[i + 1];
      if (start.x === end.x && start.y === end.y) continue; // skip zero-length segments
      newSegments.push({ id: generateId(), start, end, type: 'line', groupId: newGroupId });
    }
    if (newSegments.length === 0) return;

    const newGroup: WaveformGroup = {
      id: newGroupId,
      name: expression,
      color: getNextColor(),
      visible: true,
      segments: newSegments.map(s => s.id),
    };

    setSegments(prev => [...prev, ...newSegments]);
    setGroups(prev => [...prev, newGroup]);
    setSelectedGroup(newGroupId);
    setTimeout(saveToHistory, 0);
  }, [groups, segments, getNextColor, saveToHistory]);

  // Interpolate y at x (points must be sorted by x; returns 0 outside the range)
  const interpolateY = (x: number, points: Point[]): number => {
    for (let i = 0; i < points.length - 1; i++) {
      if (x >= points[i].x && x <= points[i + 1].x) {
        const dx = points[i + 1].x - points[i].x;
        // Vertical edge (square-wave switching) or duplicate points: a zero-width interval would divide by zero; take the later point's level
        if (dx < 1e-12) {
          if (Math.abs(x - points[i].x) < 1e-12) return points[i + 1].y;
          continue;
        }
        const t = (x - points[i].x) / dx;
        return points[i].y + t * (points[i + 1].y - points[i].y);
      }
    }

    return points.find(p => Math.abs(p.x - x) < 1e-12)?.y || 0;
  };

  // Toggle a segment's selection
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

  // Clear the selection
  const clearSegmentSelection = useCallback(() => {
    setSelectedSegments(new Set());
  }, []);

  // Rubber-band: select segments fully inside the rect (additive=true appends to the selection)
  const selectSegmentsInRect = useCallback((corner1: Point, corner2: Point, additive: boolean) => {
    const xLo = Math.min(corner1.x, corner2.x);
    const xHi = Math.max(corner1.x, corner2.x);
    const yLo = Math.min(corner1.y, corner2.y);
    const yHi = Math.max(corner1.y, corner2.y);
    const inRect = (p: Point) => p.x >= xLo && p.x <= xHi && p.y >= yLo && p.y <= yHi;

    const ids = segments
      .filter(s => {
        const g = groups.find(g => g.id === s.groupId);
        if (g && !g.visible) return false; // hidden groups are excluded
        return inRect(s.start) && inRect(s.end);
      })
      .map(s => s.id);

    setSelectedSegments(prev => {
      const next = additive ? new Set(prev) : new Set<string>();
      ids.forEach(id => next.add(id));
      return next;
    });
  }, [segments, groups]);

  // Delete all selected segments (Delete/Backspace)
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

  // Move the selected segments by a delta (move, not copy)
  const moveSelectedSegments = useCallback((deltaX: number, deltaY: number) => {
    if (selectedSegments.size === 0) return;
    
    // Snap to the minor grid
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

  // Finish moving the selection (saves history)
  const finishMoveSelectedSegments = useCallback(() => {
    if (selectedSegments.size > 0) {
      saveToHistory();
    }
    setIsDraggingSelected(false);
    setDragStartPoint(null);
  }, [selectedSegments.size, saveToHistory]);

  // Ctrl+C: copy the selected segments to the clipboard
  const copyToClipboard = useCallback(() => {
    if (selectedSegments.size === 0) return;
    
    const segmentsToCopy = segments.filter(s => selectedSegments.has(s.id));
    if (segmentsToCopy.length === 0) return;
    
    setClipboardSegments(segmentsToCopy);
  }, [selectedSegments, segments]);

  // Ctrl+V: enter paste preview from the clipboard
  const enterCopyPreview = useCallback((originPoint: Point) => {
    if (clipboardSegments.length === 0) return;
    
    // Create temporary segments for the preview
    const tempSegments: LineSegment[] = clipboardSegments.map(segment => ({
      ...segment,
      id: `preview-${segment.id}`, // preview id
    }));
    
    setCopyingSegments(tempSegments);
    // Initial offset 0: the preview draws at the original spot (red dashes distinguish it)
    setCopyPreviewOffset({ x: 0, y: 0 });
    setCopyOffset({ x: 0, y: 0 });
    setCopyPreviewOrigin(originPoint);
    setIsCopyPreview(true);
  }, [clipboardSegments]);

  // Update the paste preview offset
  const updateCopyPreviewOffset = useCallback((mousePos: Point) => {
    if (!copyPreviewOrigin) return;
    
    const rawDeltaX = mousePos.x - copyPreviewOrigin.x;
    const rawDeltaY = mousePos.y - copyPreviewOrigin.y;
    
    // Snap to the minor grid
    const snapDeltaX = Math.round(rawDeltaX / axisConfig.xGridSize) * axisConfig.xGridSize;
    const snapDeltaY = Math.round(rawDeltaY / axisConfig.yGridSize) * axisConfig.yGridSize;
    
    setCopyPreviewOffset({ x: snapDeltaX, y: snapDeltaY });
    setCopyOffset({ x: snapDeltaX, y: snapDeltaY });
  }, [copyPreviewOrigin, axisConfig.xGridSize, axisConfig.yGridSize]);

  // Confirm the paste preview - materialize the preview segments
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
      
      // Update the group's segment list
      setGroups(prev => prev.map(g => 
        g.id === segment.groupId 
          ? { ...g, segments: [...g.segments, newSegment.id] }
          : g
      ));
    });
    
    // Clear the paste preview state
    setIsCopyPreview(false);
    setCopyingSegments([]);
    setCopyPreviewOffset({ x: 0, y: 0 });
    setCopyOffset({ x: 0, y: 0 });
    setCopyPreviewOrigin(null);
    setSelectedSegments(new Set());
    setTimeout(saveToHistory, 0);
  }, [copyingSegments, copyPreviewOffset, saveToHistory]);

  // Cancel the paste preview
  const cancelCopyPreview = useCallback(() => {
    setIsCopyPreview(false);
    setCopyingSegments([]);
    setCopyPreviewOffset({ x: 0, y: 0 });
    setCopyOffset({ x: 0, y: 0 });
    setCopyPreviewOrigin(null);
  }, []);

  // Clear all
  const clearAll = useCallback(() => {
    setSegments([]);
    setGroups([]);
    setSelectedGroup(null);
    setActiveSegment(null);
    setTimeout(saveToHistory, 0);
    setSelectedSegments(new Set());
  }, [saveToHistory]);

  // Build the export SVG (bounds auto-fit the visible waveforms, aligned outward to the major grid)
  const buildSVG = useCallback((): { svg: string; width: number; height: number } => {
    const padding = 60;

    // Bounding box of the visible segments
    const visibleSegments = segments.filter(s => {
      const g = groups.find(g => g.id === s.groupId);
      return !g || g.visible;
    });

    let xMin = -10, xMax = 10, yMin = -5, yMax = 5; // default range when there are no waveforms
    if (visibleSegments.length > 0) {
      xMin = Infinity; xMax = -Infinity; yMin = Infinity; yMax = -Infinity;
      visibleSegments.forEach(s => {
        const pts = s.control ? [s.start, s.end, s.control] : [s.start, s.end];
        pts.forEach(p => {
          xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x);
          yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y);
        });
      });
      // Align outward to the major grid with one extra cell of padding
      xMin = (Math.floor(xMin / axisConfig.xMajorGridSize) - 1) * axisConfig.xMajorGridSize;
      xMax = (Math.ceil(xMax / axisConfig.xMajorGridSize) + 1) * axisConfig.xMajorGridSize;
      yMin = (Math.floor(yMin / axisConfig.yMajorGridSize) - 1) * axisConfig.yMajorGridSize;
      yMax = (Math.ceil(yMax / axisConfig.yMajorGridSize) + 1) * axisConfig.yMajorGridSize;
    }

    const xRange = xMax - xMin;
    const yRange = yMax - yMin;
    // Pixels per world unit: 40 by default, reduced for large ranges to keep the export under ~2000px
    const pxPerUnit = Math.min(40, 1880 / xRange, 1880 / yRange);
    const width = Math.round(2 * padding + xRange * pxPerUnit);
    const height = Math.round(2 * padding + yRange * pxPerUnit);
    const chartWidth = width - 2 * padding;
    const chartHeight = height - 2 * padding;

    // Coordinate transform
    const worldToSVG = (point: Point): Point => ({
      x: padding + ((point.x - xMin) / xRange) * chartWidth,
      y: height - padding - ((point.y - yMin) / yRange) * chartHeight,
    });

    // Build an SVG path
    const generatePath = (segment: LineSegment): string => {
      const start = worldToSVG(segment.start);
      const end = worldToSVG(segment.end);
      
      if (segment.type === 'curve' && segment.control) {
        const control = worldToSVG(segment.control);
        return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} Q ${control.x.toFixed(2)} ${control.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
      }
      return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} L ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
    };



    // Build the SVG content
    // Note: inline style attributes only, no CSS classes - Visio does not parse <style> blocks when importing SVG,
    // with classes the stroke colors would be lost (rendered white/default)
    const MINOR_STYLE = 'stroke="#e5e7eb" stroke-width="1"';
    const MAJOR_STYLE = 'stroke="#6b7280" stroke-width="2"';
    const AXIS_STYLE = 'stroke="#000000" stroke-width="3"';
    const TICK_TEXT_STYLE = 'font-family="sans-serif" font-size="13" font-weight="bold" fill="#1f2937"';
    const UNIT_TEXT_STYLE = 'font-family="sans-serif" font-size="16" font-weight="bold" fill="#000000"';

    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <!-- 背景 -->
  <rect width="${width}" height="${height}" fill="white"/>

  <!-- 次网格线 -->
  <g id="grid-minor">
`;

    // Integer-index loops avoid float accumulation error
    const isMajor = (v: number, major: number) =>
      Math.abs(v / major - Math.round(v / major)) < 1e-6;

    // Vertical minor grid lines
    for (let i = Math.ceil(xMin / axisConfig.xGridSize); i * axisConfig.xGridSize <= xMax + 1e-9; i++) {
      const x = i * axisConfig.xGridSize;
      if (isMajor(x, axisConfig.xMajorGridSize)) continue;
      const screenX = worldToSVG({ x, y: 0 }).x;
      svg += `    <line ${MINOR_STYLE} x1="${screenX.toFixed(2)}" y1="${padding}" x2="${screenX.toFixed(2)}" y2="${height - padding}"/>\n`;
    }

    // Horizontal minor grid lines
    for (let i = Math.ceil(yMin / axisConfig.yGridSize); i * axisConfig.yGridSize <= yMax + 1e-9; i++) {
      const y = i * axisConfig.yGridSize;
      if (isMajor(y, axisConfig.yMajorGridSize)) continue;
      const screenY = worldToSVG({ x: 0, y }).y;
      svg += `    <line ${MINOR_STYLE} x1="${padding}" y1="${screenY.toFixed(2)}" x2="${width - padding}" y2="${screenY.toFixed(2)}"/>\n`;
    }

    svg += `  </g>

  <!-- 主网格线 -->
  <g id="grid-major">
`;

    // Vertical major grid lines
    const xMajorIndexStart = Math.ceil(xMin / axisConfig.xMajorGridSize);
    const xMajorIndexEnd = Math.floor(xMax / axisConfig.xMajorGridSize + 1e-9);
    for (let i = xMajorIndexStart; i <= xMajorIndexEnd; i++) {
      const screenX = worldToSVG({ x: i * axisConfig.xMajorGridSize, y: 0 }).x;
      svg += `    <line ${MAJOR_STYLE} x1="${screenX.toFixed(2)}" y1="${padding}" x2="${screenX.toFixed(2)}" y2="${height - padding}"/>\n`;
    }

    // Horizontal major grid lines
    const yMajorIndexStart = Math.ceil(yMin / axisConfig.yMajorGridSize);
    const yMajorIndexEnd = Math.floor(yMax / axisConfig.yMajorGridSize + 1e-9);
    for (let i = yMajorIndexStart; i <= yMajorIndexEnd; i++) {
      const screenY = worldToSVG({ x: 0, y: i * axisConfig.yMajorGridSize }).y;
      svg += `    <line ${MAJOR_STYLE} x1="${padding}" y1="${screenY.toFixed(2)}" x2="${width - padding}" y2="${screenY.toFixed(2)}"/>\n`;
    }

    svg += `  </g>

  <!-- 坐标轴 -->
  <g id="axes">
`;

    // Axes are drawn only when the origin falls inside the range; otherwise tick labels hug the edge
    const hasXAxis = yMin <= 0 && yMax >= 0;
    const hasYAxis = xMin <= 0 && xMax >= 0;
    const originY = hasXAxis ? worldToSVG({ x: 0, y: 0 }).y : height - padding;
    const originX = hasYAxis ? worldToSVG({ x: 0, y: 0 }).x : padding;

    if (hasXAxis) {
      svg += `    <line ${AXIS_STYLE} x1="${padding}" y1="${originY.toFixed(2)}" x2="${width - padding}" y2="${originY.toFixed(2)}"/>\n`;
    }
    if (hasYAxis) {
      svg += `    <line ${AXIS_STYLE} x1="${originX.toFixed(2)}" y1="${padding}" x2="${originX.toFixed(2)}" y2="${height - padding}"/>\n`;
    }

    svg += `  </g>

  <!-- 刻度标签（主格点） -->
  <g id="tick-labels">
`;

    // X-axis ticks (major grid)
    for (let i = xMajorIndexStart; i <= xMajorIndexEnd; i++) {
      const x = i * axisConfig.xMajorGridSize;
      if (Math.abs(x) < 0.001 && hasXAxis && hasYAxis) continue; // no number at the origin
      const screenX = worldToSVG({ x, y: 0 }).x;
      const label = Number.isInteger(x) ? x.toString() : x.toFixed(1);
      svg += `    <text ${TICK_TEXT_STYLE} x="${screenX.toFixed(2)}" y="${(originY + 20).toFixed(2)}" text-anchor="middle">${label}</text>\n`;
    }

    // Y-axis ticks (major grid)
    for (let i = yMajorIndexStart; i <= yMajorIndexEnd; i++) {
      const y = i * axisConfig.yMajorGridSize;
      if (Math.abs(y) < 0.001 && hasXAxis && hasYAxis) continue;
      const screenY = worldToSVG({ x: 0, y }).y;
      const label = Number.isInteger(y) ? y.toString() : y.toFixed(1);
      svg += `    <text ${TICK_TEXT_STYLE} x="${(originX - 10).toFixed(2)}" y="${(screenY + 4).toFixed(2)}" text-anchor="end">${label}</text>\n`;
    }

    svg += `  </g>

  <!-- 轴标签 -->
  <g id="axis-labels">
    <text ${UNIT_TEXT_STYLE} x="${(width - padding + 20).toFixed(2)}" y="${(originY + 5).toFixed(2)}" text-anchor="middle">${escapeXml(axisConfig.xUnit)}</text>
    <text ${UNIT_TEXT_STYLE} x="${(originX - 25).toFixed(2)}" y="${(padding - 20).toFixed(2)}" text-anchor="middle">${escapeXml(axisConfig.yUnit)}</text>
  </g>

  <!-- 波形（按组分层，Visio中取消组合可逐级拆到单条线段） -->
  <g id="waveforms">
`;

    groups.forEach((group, gi) => {
      if (!group.visible) return;
      const groupSegments = segments.filter(s => s.groupId === group.id);
      if (groupSegments.length === 0) return;

      svg += `    <g id="wave-group-${gi + 1}">\n      <title>${escapeXml(group.name)}</title>\n`;
      groupSegments.forEach(segment => {
        svg += `      <path d="${generatePath(segment)}" stroke="${group.color}" stroke-width="2" fill="none"/>\n`;
      });
      svg += `    </g>\n`;
    });

    // Fallback for segments that belong to no group
    const orphanSegments = segments.filter(s => !groups.some(g => g.id === s.groupId));
    if (orphanSegments.length > 0) {
      svg += `    <g id="wave-group-ungrouped">\n`;
      orphanSegments.forEach(segment => {
        svg += `      <path d="${generatePath(segment)}" stroke="#3b82f6" stroke-width="2" fill="none"/>\n`;
      });
      svg += `    </g>\n`;
    }

    svg += `  </g>
</svg>`;

    return { svg, width, height };
  }, [segments, groups, axisConfig]);

  const exportToSVG = useCallback((): string => buildSVG().svg, [buildSVG]);

  // Download as SVG
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

  // Download as PNG (hi-res, 3x render by default)
  const downloadPNG = useCallback((filename: string = 'waveform.png', scaleFactor: number = 3) => {
    const { svg, width, height } = buildSVG();
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scaleFactor);
      canvas.height = Math.round(height * scaleFactor);
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(svgUrl); return; }
      ctx.scale(scaleFactor, scaleFactor);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(svgUrl);

      canvas.toBlob(blob => {
        if (!blob) return;
        const pngUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(pngUrl);
      }, 'image/png');
    };
    img.onerror = () => URL.revokeObjectURL(svgUrl);
    img.src = svgUrl;
  }, [buildSVG]);

  // Export the waveform data as a JSON object
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

  // Download as JSON
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

  // Import waveform data (1.0-compatible: legacy xMin/xMax/yMin/yMax/zoom fields are ignored)
  const importData = useCallback((data: {
    version?: string;
    axisConfig?: Partial<AxisConfig>;
    viewport?: Partial<Viewport>;
    groups?: WaveformGroup[];
    segments?: LineSegment[];
  }) => {
    // Import the axis config if present, keeping only known fields
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

    // Restore the viewport (2.0+ only; older files keep the current one)
    if (data.viewport) {
      const v = data.viewport;
      setViewport({
        centerX: v.centerX ?? 0,
        centerY: v.centerY ?? 0,
        scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale || BASE_SCALE)),
      });
    }
    
    // Import groups and segments
    if (data.groups && data.segments) {
      setGroups(data.groups);
      setSegments(data.segments);
    }
    
    // Clear selection state
    setSelectedGroup(null);
    setSelectedSegments(new Set());
    setActiveSegment(null);
    setTimeout(saveToHistory, 0);
  }, [saveToHistory]);

  // Generate common waveforms
  const generateWaveform = useCallback((
    type: WaveformType,
    params: {
      amplitude: number;
      period: number;
      dutyCycle: number;
      totalCycles: number;
      startTime: number;
      phaseShift: number;
      offset?: number;      // DC offset (all waveform types)
      edgePercent?: number; // trapezoid: single-edge time as % of the period
      dampingTau?: number;  // damped ringing: decay constant in periods
    },
    groupName: string,
    customColor?: string,
    skipHistorySave?: boolean
  ) => {
    const { amplitude, period, dutyCycle, totalCycles, startTime, phaseShift } = params;
    const offset = params.offset ?? 0;
    const phaseOffset = (phaseShift / 360) * period; // convert to a time offset
    
    // Create the new group
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
    
    // Generate key points, then connect them with segments
    const points: Point[] = [];
    
    if (type === 'square') {
      // Square wave from key points (horizontal + vertical strokes)
      // Each cycle: low start -> rising edge -> high -> falling edge -> low
      const dutyTime = (dutyCycle / 100) * period;
      const lowLevel = -amplitude;
      const highLevel = amplitude;
      
      for (let cycle = 0; cycle < totalCycles; cycle++) {
        const cycleStart = startTime + cycle * period + phaseOffset;
        
        // Cycle start (low)
        points.push({ x: cycleStart, y: lowLevel });
        // Rising edge start (low)
        points.push({ x: cycleStart, y: lowLevel });
        // Rising edge end (high)
        points.push({ x: cycleStart, y: highLevel });
        // High level end
        points.push({ x: cycleStart + dutyTime, y: highLevel });
        // Falling edge end (low)
        points.push({ x: cycleStart + dutyTime, y: lowLevel });
        // Cycle end (low)
        points.push({ x: cycleStart + period, y: lowLevel });
      }
    } else if (type === 'ramp') {
      // Ramp (inductor-current shape): rise + fall
      // duty cycle sets the rise time
      const riseTime = (dutyCycle / 100) * period;
      const lowLevel = 0; // starts from 0
      const highLevel = amplitude;
      
      for (let cycle = 0; cycle < totalCycles; cycle++) {
        const cycleStart = startTime + cycle * period + phaseOffset;
        
        // Cycle start (low)
        points.push({ x: cycleStart, y: lowLevel });
        // Rise end (peak)
        points.push({ x: cycleStart + riseTime, y: highLevel });
        // Fall end (back to low)
        points.push({ x: cycleStart + period, y: lowLevel });
      }
    } else if (type === 'sine') {
      // Sine: connected sample points
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
    } else if (type === 'triangle') {
      // Triangle: duty cycle sets the peak position (50% = symmetric, PWM carrier)
      const peakTime = (dutyCycle / 100) * period;
      for (let cycle = 0; cycle < totalCycles; cycle++) {
        const cycleStart = startTime + cycle * period + phaseOffset;
        points.push({ x: cycleStart, y: -amplitude });
        points.push({ x: cycleStart + peakTime, y: amplitude });
      }
      points.push({ x: startTime + totalCycles * period + phaseOffset, y: -amplitude });
    } else if (type === 'sawtooth') {
      // Sawtooth: linear rise over the full period, instant fall (PWM carrier / slope compensation)
      for (let cycle = 0; cycle < totalCycles; cycle++) {
        const cycleStart = startTime + cycle * period + phaseOffset;
        points.push({ x: cycleStart, y: -amplitude });
        points.push({ x: cycleStart + period, y: amplitude });
        points.push({ x: cycleStart + period, y: -amplitude });
      }
    } else if (type === 'trapezoid') {
      // Trapezoid: switching waveform with finite edges (switch-node voltage, gate drive)
      const edgeFrac = Math.max(0.1, Math.min(40, params.edgePercent ?? 10)) / 100;
      const edgeTime = edgeFrac * period;
      // High time = duty time minus one edge time (duty measured at edge midpoints, approximately)
      const highTime = Math.max(0, (dutyCycle / 100) * period - edgeTime);
      const lowLevel = -amplitude;
      const highLevel = amplitude;

      for (let cycle = 0; cycle < totalCycles; cycle++) {
        const cycleStart = startTime + cycle * period + phaseOffset;
        points.push({ x: cycleStart, y: lowLevel });
        points.push({ x: cycleStart + edgeTime, y: highLevel });
        points.push({ x: cycleStart + edgeTime + highTime, y: highLevel });
        points.push({ x: cycleStart + 2 * edgeTime + highTime, y: lowLevel });
        points.push({ x: cycleStart + period, y: lowLevel });
      }
    } else if (type === 'rectified') {
      // Rectified sine |A*sin| (rectifier output)
      const samplesPerPeriod = 20;
      const totalSamples = Math.ceil(samplesPerPeriod * totalCycles);
      const dt = period / samplesPerPeriod;
      const phaseRad = (phaseShift * Math.PI) / 180;

      for (let i = 0; i <= totalSamples; i++) {
        const t = startTime + i * dt;
        const normalizedT = ((t - startTime) / period) * 2 * Math.PI + phaseRad;
        points.push({ x: t, y: Math.abs(amplitude * Math.sin(normalizedT)) });
      }
    } else if (type === 'damped') {
      // Damped ringing A*e^(-t/(tau*T))*sin(2*pi*t/T) (switch-node ringing, LC resonance)
      const tau = Math.max(0.1, params.dampingTau ?? 2) * period; // time constant
      const samplesPerPeriod = 40;
      const totalSamples = Math.ceil(samplesPerPeriod * totalCycles);
      const dt = period / samplesPerPeriod;
      const phaseRad = (phaseShift * Math.PI) / 180;

      for (let i = 0; i <= totalSamples; i++) {
        const t = i * dt;
        const y = amplitude * Math.exp(-t / tau) * Math.sin((t / period) * 2 * Math.PI + phaseRad);
        points.push({ x: startTime + t, y });
      }
    }

    // DC offset
    const shifted = offset !== 0 ? points.map(p => ({ x: p.x, y: p.y + offset })) : points;

    // Connect the points into segments (skipping zero-length ones)
    for (let i = 0; i < shifted.length - 1; i++) {
      const start = shifted[i];
      const end = shifted[i + 1];
      if (start.x === end.x && start.y === end.y) continue;
      const newSegment: LineSegment = {
        id: generateId(),
        start,
        end,
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
    isDraggingSelected,
    dragStartPoint,
    isCopyPreview,
    copyPreviewOffset,
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
    setIsDraggingSelected,
    setDragStartPoint,
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
    selectSegmentsInRect,
    deleteSelectedSegments,
    moveSelectedSegments,
    finishMoveSelectedSegments,
    copyToClipboard,
    enterCopyPreview,
    updateCopyPreviewOffset,
    confirmCopyPreview,
    cancelCopyPreview,
    calculateExpression,
    clearAll,
    undo,
    redo,
    downloadSVG,
    downloadPNG,
    downloadJSON,
    importData,
    generateWaveform,
  };
}
