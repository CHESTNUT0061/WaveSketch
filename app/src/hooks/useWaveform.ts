import { useState, useCallback, useRef, useEffect } from 'react';
import type { Point, LineSegment, WaveformGroup, AxisConfig, AxisCursor, Viewport, CalcRpnToken, LogicRpnToken, ToolMode, ParametricSine, TextAnnotation } from '@/types/waveform';
import { DEFAULT_LINE_WIDTH, LINE_DASH } from '@/types/waveform';
import type { DcdcTemplate, DcdcTemplateParams } from '@/components/WaveformGenerator';
import { buildWaveformPoints, type GenerateParams, type WaveformType } from '@/lib/waveformGeneration';
import { calculateLogicPoints } from '@/lib/digitalLogic';
import { layoutSvgLegend, renderSvgLegend } from '@/lib/svgLegend';
import { groupsBottomToTop, reorderGroupList } from '@/lib/waveformOrder';
import { nextCursorLabel, renderSvgCursors, sanitizeAxisCursors } from '@/lib/axisCursor';
import { deleteSegmentsAndEmptyGroups } from '@/lib/waveformDeletion';
import { calculateArithmeticPoints } from '@/lib/waveformArithmetic';
import { normalizeAxisConfig } from '@/lib/axisConfig';
import { DEFAULT_ANNOTATION_STYLE, getAnnotationBounds, getAnnotationIdsFullyInsideRect, renderSvgAnnotations, sanitizeAnnotations } from '@/lib/annotation';

const generateId = () => Math.random().toString(36).slice(2, 11);

// Base scale: pixels per world unit at 100% zoom
export const BASE_SCALE = 40;
export const MIN_SCALE = BASE_SCALE * 0.1;  // 10%
export const MAX_SCALE = BASE_SCALE * 10;   // 1000%

const DEFAULT_VIEWPORT: Viewport = { centerX: 0, centerY: 0, scaleX: BASE_SCALE, scaleY: BASE_SCALE };

const clampScale = (v: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, v));

export { MIN_GRID_SIZE } from '@/lib/axisConfig';

// Escape XML text (group names / unit labels may contain special chars)
const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// localStorage autosave
const DRAFT_KEY = 'waveform-draft-v1';
const CURSOR_EXPORT_KEY = 'wavesketch-export-cursors';

interface Draft {
  segments: LineSegment[];
  groups: WaveformGroup[];
  cursors?: AxisCursor[];
  annotations?: TextAnnotation[];
  axisConfig?: Partial<AxisConfig>;
  viewport?: Partial<Viewport> & { scale?: number }; // `scale` = legacy uniform-zoom field
}

// Normalize a stored viewport, migrating the legacy single `scale` field
function normalizeViewport(v: (Partial<Viewport> & { scale?: number }) | undefined): Viewport {
  if (!v) return DEFAULT_VIEWPORT;
  const legacy = v.scale;
  return {
    centerX: v.centerX ?? 0,
    centerY: v.centerY ?? 0,
    scaleX: clampScale(v.scaleX ?? legacy ?? BASE_SCALE),
    scaleY: clampScale(v.scaleY ?? legacy ?? BASE_SCALE),
  };
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
  cursors: AxisCursor[];
  annotations: TextAnnotation[];
}

type HistoryInput = Omit<HistoryState, 'annotations'> & { annotations?: TextAnnotation[] };

interface SvgBuildOptions {
  includeBackground?: boolean;
  alignBoundsToGrid?: boolean;
  contentPadding?: number;
  includeGrid?: boolean;
  includeAxes?: boolean;
  includeLegend?: boolean;
  includeCursors?: boolean;
  includeAnnotations?: boolean;
  selectionOnly?: boolean;
}

export interface ImageExportOptions {
  format: 'png' | 'svg';
  includeGrid: boolean;
  includeAxes: boolean;
  includeLegend: boolean;
  includeCursors: boolean;
}

function sampleParametricSine(sine: ParametricSine, samplesPerPeriod = 80): Point[] {
  const samples = Math.max(80, Math.ceil(sine.totalCycles * samplesPerPeriod));
  const totalTime = sine.period * sine.totalCycles;
  const phase = sine.phaseShift * Math.PI / 180;
  return Array.from({ length: samples + 1 }, (_, index) => {
    const elapsed = totalTime * index / samples;
    return {
      x: sine.startTime + elapsed,
      y: sine.offset + sine.amplitude * Math.sin(2 * Math.PI * elapsed / sine.period + phase),
    };
  });
}

// One editable quadratic Bezier per half-period. With equal endpoint levels and
// a control point at twice the peak amplitude, the midpoint lands at ±amplitude.
// This deliberately favors a compact, hand-editable waveform over dense samples.
function buildSineHalfCycleSegments(params: GenerateParams, groupId: string): LineSegment[] {
  const amplitude = params.amplitude;
  const period = Math.max(0.001, params.period);
  const totalHalfCycles = Math.max(1, Math.floor(params.totalCycles)) * 2;
  const offset = params.offset ?? 0;
  const phaseOffset = period * params.phaseShift / 360;
  const halfPeriod = period / 2;
  const segments: LineSegment[] = [];

  for (let index = 0; index < totalHalfCycles; index++) {
    const startX = params.startTime + phaseOffset + index * halfPeriod;
    const sign = index % 2 === 0 ? 1 : -1;
    segments.push({
      id: generateId(),
      start: { x: startX, y: offset },
      end: { x: startX + halfPeriod, y: offset },
      control: { x: startX + halfPeriod / 2, y: offset + sign * 2 * amplitude },
      type: 'curve',
      groupId,
    });
  }
  return segments;
}

// Full-wave rectification makes the original positive and negative half-cycles
// identical. Therefore one generated period is one positive lobe, not two.
function buildRectifiedHalfCycleSegments(params: GenerateParams, groupId: string): LineSegment[] {
  const amplitude = Math.abs(params.amplitude);
  const period = Math.max(0.001, params.period);
  const totalCycles = Math.max(1, Math.floor(params.totalCycles));
  const offset = params.offset ?? 0;
  const phaseOffset = period * params.phaseShift / 360;
  const segments: LineSegment[] = [];

  for (let index = 0; index < totalCycles; index++) {
    const startX = params.startTime + phaseOffset + index * period;
    segments.push({
      id: generateId(),
      start: { x: startX, y: offset },
      end: { x: startX + period, y: offset },
      control: { x: startX + period / 2, y: offset + 2 * amplitude },
      type: 'curve',
      groupId,
    });
  }
  return segments;
}

// Damping is captured in the individual half-cycle peak values. Editing one
// segment therefore does not recalculate or distort later portions of the ring.
function buildDampedHalfCycleSegments(params: GenerateParams, groupId: string): LineSegment[] {
  const amplitude = params.amplitude;
  const period = Math.max(0.001, params.period);
  const totalHalfCycles = Math.max(1, Math.floor(params.totalCycles)) * 2;
  const offset = params.offset ?? 0;
  const phaseOffset = period * params.phaseShift / 360;
  const halfPeriod = period / 2;
  const tau = Math.max(0.1, params.dampingTau ?? 2) * period;
  const segments: LineSegment[] = [];

  for (let index = 0; index < totalHalfCycles; index++) {
    const startX = params.startTime + phaseOffset + index * halfPeriod;
    const peakTime = (index + 0.5) * halfPeriod;
    const peakAmplitude = amplitude * Math.exp(-peakTime / tau);
    const sign = index % 2 === 0 ? 1 : -1;
    segments.push({
      id: generateId(),
      start: { x: startX, y: offset },
      end: { x: startX + halfPeriod, y: offset },
      control: { x: startX + halfPeriod / 2, y: offset + sign * 2 * peakAmplitude },
      type: 'curve',
      groupId,
    });
  }
  return segments;
}

interface TemplateTrace {
  name: string;
  color: string;
  points: Point[];
}

const TEMPLATE_COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed'];

function buildSquareTrace(period: number, totalCycles: number, startTime: number, amplitude: number, offset: number, dutyCycle = 50, phaseShift = 0): Point[] {
  const dutyTime = period * Math.max(0, Math.min(100, dutyCycle)) / 100;
  const phaseOffset = period * phaseShift / 360;
  const points: Point[] = [];
  for (let cycle = 0; cycle < totalCycles; cycle++) {
    const t = startTime + cycle * period + phaseOffset;
    points.push({ x: t, y: offset - amplitude });
    points.push({ x: t, y: offset + amplitude });
    points.push({ x: t + dutyTime, y: offset + amplitude });
    points.push({ x: t + dutyTime, y: offset - amplitude });
    points.push({ x: t + period, y: offset - amplitude });
  }
  return points;
}

function buildSineTrace(period: number, totalCycles: number, startTime: number, amplitude: number, offset: number, phaseDegrees = 0, cyclesPerPeriod = 1): Point[] {
  const sampleCount = Math.max(2, Math.ceil(totalCycles * 40 * cyclesPerPeriod));
  const totalTime = period * totalCycles;
  const phase = phaseDegrees * Math.PI / 180;
  return Array.from({ length: sampleCount + 1 }, (_, i) => {
    const t = totalTime * i / sampleCount;
    return {
      x: startTime + t,
      y: offset + amplitude * Math.sin(2 * Math.PI * cyclesPerPeriod * t / period + phase),
    };
  });
}

function buildRampTrace(period: number, totalCycles: number, startTime: number, amplitude: number, offset: number, dutyCycle: number, invert = false): Point[] {
  const riseTime = period * Math.max(1, Math.min(99, dutyCycle)) / 100;
  const low = offset - amplitude;
  const high = offset + amplitude;
  const points: Point[] = [];
  for (let cycle = 0; cycle < totalCycles; cycle++) {
    const t = startTime + cycle * period;
    points.push({ x: t, y: invert ? high : low });
    points.push({ x: t + riseTime, y: invert ? low : high });
    points.push({ x: t + period, y: invert ? high : low });
  }
  return points;
}

function buildDcdcTemplate(template: DcdcTemplate, params: DcdcTemplateParams): TemplateTrace[] {
  const amplitude = Math.abs(params.amplitude);
  const period = Math.max(0.001, params.period);
  const totalCycles = Math.max(1, Math.floor(params.totalCycles));
  const { startTime, dutyCycle, phaseShift } = params;

  if (template === 'llc') {
    const ratio = Math.max(0.25, Math.min(4, params.resonantRatio));
    return [
      { name: 'LLC · vHB', color: TEMPLATE_COLORS[0], points: buildSquareTrace(period, totalCycles, startTime, amplitude * 0.8, amplitude * 4, 50) },
      { name: 'LLC · iLr', color: TEMPLATE_COLORS[1], points: buildSineTrace(period, totalCycles, startTime, amplitude * 0.8, amplitude * 1.5, -10, ratio) },
      { name: 'LLC · iLm', color: TEMPLATE_COLORS[2], points: buildRampTrace(period, totalCycles, startTime, amplitude * 0.45, amplitude * -1, 50) },
      { name: 'LLC · vCr', color: TEMPLATE_COLORS[3], points: buildSineTrace(period, totalCycles, startTime, amplitude * 0.7, amplitude * -3.5, -100, ratio) },
      { name: 'LLC · iSec', color: TEMPLATE_COLORS[4], points: buildSineTrace(period, totalCycles, startTime, amplitude * 0.75, amplitude * -6, 0, ratio).map(p => ({ ...p, y: amplitude * -6 + Math.abs(p.y - amplitude * -6) })) },
    ];
  }

  if (template === 'dab') {
    return [
      { name: 'DAB · vAB', color: TEMPLATE_COLORS[0], points: buildSquareTrace(period, totalCycles, startTime, amplitude * 0.8, amplitude * 2.8) },
      { name: 'DAB · vCD', color: TEMPLATE_COLORS[1], points: buildSquareTrace(period, totalCycles, startTime, amplitude * 0.8, 0, 50, phaseShift) },
      { name: 'DAB · iL', color: TEMPLATE_COLORS[2], points: buildRampTrace(period, totalCycles, startTime, amplitude * 0.7, amplitude * -2.8, 50) },
    ];
  }

  const isBoost = template === 'boost';
  const prefix = isBoost ? 'Boost' : 'Buck';
  return [
    { name: `${prefix} · vSW`, color: TEMPLATE_COLORS[0], points: buildSquareTrace(period, totalCycles, startTime, amplitude * 0.8, amplitude * 2.6, dutyCycle) },
    { name: `${prefix} · iL`, color: TEMPLATE_COLORS[1], points: buildRampTrace(period, totalCycles, startTime, amplitude * 0.65, 0, isBoost ? 100 - dutyCycle : dutyCycle, isBoost) },
    { name: `${prefix} · iC`, color: TEMPLATE_COLORS[2], points: buildRampTrace(period, totalCycles, startTime, amplitude * 0.45, amplitude * -2.6, dutyCycle, !isBoost) },
  ];
}

export function useWaveform() {
  // Restore the draft from localStorage on load (read once)
  const [draft] = useState(loadDraft);

  const [segments, setSegments] = useState<LineSegment[]>(draft?.segments ?? []);
  const [groups, setGroups] = useState<WaveformGroup[]>(draft?.groups ?? []);
  const [cursors, setCursors] = useState<AxisCursor[]>(() => sanitizeAxisCursors(draft?.cursors));
  const [annotations, setAnnotations] = useState<TextAnnotation[]>(() => sanitizeAnnotations(draft?.annotations));
  const [selectedAnnotation, setSelectedAnnotationState] = useState<string | null>(null);
  const [selectedAnnotations, setSelectedAnnotations] = useState<Set<string>>(new Set());
  const setSelectedAnnotation = useCallback((annotationId: string | null) => {
    setSelectedAnnotationState(annotationId);
    setSelectedAnnotations(annotationId ? new Set([annotationId]) : new Set());
  }, []);
  const selectAnnotation = useCallback((annotationId: string, additive: boolean) => {
    const next = additive ? new Set(selectedAnnotations) : new Set<string>();
    if (additive && next.has(annotationId)) next.delete(annotationId);
    else next.add(annotationId);
    setSelectedAnnotations(next);
    setSelectedAnnotationState(next.has(annotationId) ? annotationId : [...next].at(-1) ?? null);
  }, [selectedAnnotations]);
  const [includeCursorsInExport, setIncludeCursorsInExport] = useState(() => {
    try { return localStorage.getItem(CURSOR_EXPORT_KEY) !== 'false'; } catch { return true; }
  });

  // Undo/redo history - kept in refs to avoid stale closures; the restored draft is the undo baseline
  const historyRef = useRef<HistoryState[]>([{
    segments: draft?.segments ?? [],
    groups: draft?.groups ?? [],
    cursors: sanitizeAxisCursors(draft?.cursors),
    annotations: sanitizeAnnotations(draft?.annotations),
  }]);
  const historyIndexRef = useRef<number>(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  
  // Refs mirroring the latest state
  const segmentsRef = useRef<LineSegment[]>([]);
  const groupsRef = useRef<WaveformGroup[]>([]);
  const cursorsRef = useRef<AxisCursor[]>([]);
  const annotationsRef = useRef<TextAnnotation[]>([]);
  
  // Keep refs in sync with state without mutating refs during render.
  useEffect(() => {
    segmentsRef.current = segments;
    groupsRef.current = groups;
    cursorsRef.current = cursors;
    annotationsRef.current = annotations;
  }, [segments, groups, cursors, annotations]);
  
  // Update undo/redo availability
  const updateHistoryState = useCallback(() => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);
  
  const [axisConfig, setAxisConfigState] = useState<AxisConfig>(() => normalizeAxisConfig(draft?.axisConfig));
  const setAxisConfig = useCallback((config: AxisConfig) => {
    setAxisConfigState(normalizeAxisConfig(config));
  }, []);
  // Infinite-canvas viewport (pan center + per-axis scale)
  const [viewport, setViewport] = useState<Viewport>(() => normalizeViewport(draft?.viewport));

  // Autosave the draft to localStorage (500ms debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ segments, groups, cursors, annotations, axisConfig, viewport }));
      } catch {
        // Fail silently if storage is full or disabled
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [segments, groups, cursors, annotations, axisConfig, viewport]);
  useEffect(() => {
    try { localStorage.setItem(CURSOR_EXPORT_KEY, String(includeCursorsInExport)); } catch { /* ignore */ }
  }, [includeCursorsInExport]);
  const [mode, setMode] = useState<ToolMode>('select'); // select is the default tool
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
  const [copyingAnnotations, setCopyingAnnotations] = useState<TextAnnotation[]>([]);
  const [copyOffset, setCopyOffset] = useState<Point>({ x: 0, y: 0 }); // copy offset
  const [isDraggingSelected, setIsDraggingSelected] = useState(false); // whether the selection is being dragged
  const [dragStartPoint, setDragStartPoint] = useState<Point | null>(null); // drag start point

  // Paste-preview state for select mode
  const [isCopyPreview, setIsCopyPreview] = useState(false); // whether the paste preview is active
  const [copyPreviewOffset, setCopyPreviewOffset] = useState<Point>({ x: 0, y: 0 }); // paste preview offset
  const [copyPreviewOrigin, setCopyPreviewOrigin] = useState<Point | null>(null); // paste preview reference origin
  const [clipboardSegments, setClipboardSegments] = useState<LineSegment[]>([]); // clipboard segments (Ctrl+C)
  const [clipboardAnnotations, setClipboardAnnotations] = useState<TextAnnotation[]>([]);

  const pushHistoryState = useCallback((state: HistoryInput) => {
    const newState: HistoryState = JSON.parse(JSON.stringify({
      ...state,
      annotations: state.annotations ?? annotationsRef.current,
    }));
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

  // Save the current state as a new history step
  const saveToHistory = useCallback(() => {
    pushHistoryState({
      segments: segmentsRef.current,
      groups: groupsRef.current,
      cursors: cursorsRef.current,
      annotations: annotationsRef.current,
    });
  }, [pushHistoryState]);

  // Undo
  const undo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      const prevState = historyRef.current[historyIndexRef.current];
      segmentsRef.current = JSON.parse(JSON.stringify(prevState.segments));
      groupsRef.current = JSON.parse(JSON.stringify(prevState.groups));
      cursorsRef.current = JSON.parse(JSON.stringify(prevState.cursors));
      annotationsRef.current = JSON.parse(JSON.stringify(prevState.annotations));
      setSegments(segmentsRef.current);
      setGroups(groupsRef.current);
      setCursors(cursorsRef.current);
      setAnnotations(annotationsRef.current);
      setSelectedAnnotation(null);
      updateHistoryState();
    }
  }, [setSelectedAnnotation, updateHistoryState]);

  // Redo
  const redo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      const nextState = historyRef.current[historyIndexRef.current];
      segmentsRef.current = JSON.parse(JSON.stringify(nextState.segments));
      groupsRef.current = JSON.parse(JSON.stringify(nextState.groups));
      cursorsRef.current = JSON.parse(JSON.stringify(nextState.cursors));
      annotationsRef.current = JSON.parse(JSON.stringify(nextState.annotations));
      setSegments(segmentsRef.current);
      setGroups(groupsRef.current);
      setCursors(cursorsRef.current);
      setAnnotations(annotationsRef.current);
      setSelectedAnnotation(null);
      updateHistoryState();
    }
  }, [setSelectedAnnotation, updateHistoryState]);

  // World -> screen (CSS pixels), centered on the viewport.
  // Uses clientWidth/Height because the canvas backing store is scaled by devicePixelRatio.
  const worldToScreen = useCallback((point: Point, canvas: HTMLCanvasElement): Point => {
    return {
      x: canvas.clientWidth / 2 + (point.x - viewport.centerX) * viewport.scaleX,
      y: canvas.clientHeight / 2 - (point.y - viewport.centerY) * viewport.scaleY,
    };
  }, [viewport]);

  // Screen (CSS pixels) -> world
  const screenToWorld = useCallback((point: Point, canvas: HTMLCanvasElement): Point => {
    return {
      x: viewport.centerX + (point.x - canvas.clientWidth / 2) / viewport.scaleX,
      y: viewport.centerY - (point.y - canvas.clientHeight / 2) / viewport.scaleY,
    };
  }, [viewport]);

  // Snap to grid
  const snapToGrid = useCallback((point: Point): Point => {
    return {
      x: Math.round(point.x / axisConfig.xGridSize) * axisConfig.xGridSize,
      y: Math.round(point.y / axisConfig.yGridSize) * axisConfig.yGridSize,
    };
  }, [axisConfig]);

  const createCursor = useCallback((axis: AxisCursor['axis']) => {
    const cursor: AxisCursor = {
      id: generateId(),
      axis,
      value: axis === 'x' ? viewport.centerX : viewport.centerY,
      label: nextCursorLabel(axis, cursorsRef.current),
      visible: true,
    };
    const nextCursors = [...cursorsRef.current, cursor];
    cursorsRef.current = nextCursors;
    setCursors(nextCursors);
    pushHistoryState({ segments: segmentsRef.current, groups: groupsRef.current, cursors: nextCursors });
    return cursor.id;
  }, [viewport.centerX, viewport.centerY, pushHistoryState]);

  const updateCursor = useCallback((cursorId: string, value: number, saveHistory = false) => {
    if (!Number.isFinite(value)) return;
    const nextCursors = cursorsRef.current.map(cursor => cursor.id === cursorId ? { ...cursor, value } : cursor);
    cursorsRef.current = nextCursors;
    setCursors(nextCursors);
    if (saveHistory) pushHistoryState({ segments: segmentsRef.current, groups: groupsRef.current, cursors: nextCursors });
  }, [pushHistoryState]);

  const commitCursorChange = useCallback(() => {
    pushHistoryState({ segments: segmentsRef.current, groups: groupsRef.current, cursors: cursorsRef.current });
  }, [pushHistoryState]);

  const toggleCursorVisibility = useCallback((cursorId: string) => {
    const nextCursors = cursorsRef.current.map(cursor => cursor.id === cursorId ? { ...cursor, visible: !cursor.visible } : cursor);
    cursorsRef.current = nextCursors;
    setCursors(nextCursors);
    pushHistoryState({ segments: segmentsRef.current, groups: groupsRef.current, cursors: nextCursors });
  }, [pushHistoryState]);

  const deleteCursor = useCallback((cursorId: string) => {
    const nextCursors = cursorsRef.current.filter(cursor => cursor.id !== cursorId);
    if (nextCursors.length === cursorsRef.current.length) return;
    cursorsRef.current = nextCursors;
    setCursors(nextCursors);
    pushHistoryState({ segments: segmentsRef.current, groups: groupsRef.current, cursors: nextCursors });
  }, [pushHistoryState]);

  const focusCursor = useCallback((cursorId: string) => {
    const cursor = cursorsRef.current.find(item => item.id === cursorId);
    if (!cursor) return;
    setViewport(previous => cursor.axis === 'x'
      ? { ...previous, centerX: cursor.value }
      : { ...previous, centerY: cursor.value });
  }, []);

  // Add a segment (internal, no history entry)
  const addSegmentInternal = useCallback((start: Point, end: Point, type: 'line' | 'curve' = 'line', targetGroupId?: string): string => {
    let effectiveGroupId = targetGroupId || selectedGroup;

    // Resolve and create the target group from the ref-backed snapshot. This
    // keeps the first group and its first segment in one state transition;
    // separate async setGroups calls can otherwise race with history/autosave.
    let nextGroups = groupsRef.current;
    if (!effectiveGroupId || !nextGroups.some(group => group.id === effectiveGroupId)) {
      const defaultGroup = nextGroups.find(group => group.name === '默认组');
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
        nextGroups = [...nextGroups, newGroup];
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
    
    nextGroups = nextGroups.map(group =>
      group.id === effectiveGroupId
        ? { ...group, segments: [...group.segments, newSegment.id] }
        : group
    );
    const nextSegments = [...segmentsRef.current, newSegment];
    groupsRef.current = nextGroups;
    segmentsRef.current = nextSegments;
    setGroups(nextGroups);
    setSegments(nextSegments);
    
    return newSegment.id;
  }, [selectedGroup]);

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

  const applySegmentDeletion = useCallback((segmentIds: ReadonlySet<string>) => {
    if (segmentIds.size === 0) return;
    const result = deleteSegmentsAndEmptyGroups(segmentsRef.current, groupsRef.current, segmentIds);
    if (result.segments.length === segmentsRef.current.length) return;
    segmentsRef.current = result.segments;
    groupsRef.current = result.groups;
    setSegments(result.segments);
    setGroups(result.groups);
    if (selectedGroup && result.removedGroupIds.includes(selectedGroup)) setSelectedGroup(null);
    setSelectedSegments(previous => new Set([...previous].filter(id => !segmentIds.has(id))));
    setActiveSegment(previous => previous && segmentIds.has(previous) ? null : previous);
    pushHistoryState({ segments: result.segments, groups: result.groups, cursors: cursorsRef.current });
  }, [pushHistoryState, selectedGroup]);

  // Delete a segment and remove its group if this deletion made it empty.
  const deleteSegment = useCallback((segmentId: string) => {
    applySegmentDeletion(new Set([segmentId]));
  }, [applySegmentDeletion]);

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
    const nextGroups = [...groupsRef.current, newGroup];
    groupsRef.current = nextGroups;
    setGroups(nextGroups);
    pushHistoryState({ segments: segmentsRef.current, groups: nextGroups, cursors: cursorsRef.current });
    return newGroup.id;
  }, [getNextColor, pushHistoryState]);

  // Change a group's color
  const changeGroupColor = useCallback((groupId: string, color: string) => {
    setGroups(prev => prev.map(g =>
      g.id === groupId ? { ...g, color } : g
    ));
  }, []);

  // Change a group's rendering style (color / line width / dash style / opacity)
  const changeGroupStyle = useCallback((groupId: string, style: Partial<Pick<WaveformGroup, 'color' | 'lineWidth' | 'lineStyle' | 'opacity'>>) => {
    setGroups(prev => prev.map(g =>
      g.id === groupId ? { ...g, ...style } : g
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

  // The list is stored top-first. Reordering the array therefore updates the
  // panel, layer stack, exports, autosave, and JSON without a schema change.
  const reorderGroups = useCallback((activeGroupId: string, targetGroupId: string) => {
    setGroups(prev => reorderGroupList(prev, activeGroupId, targetGroupId));
    setTimeout(saveToHistory, 0);
  }, [saveToHistory]);

  // Duplicate a group
  const duplicateGroup = useCallback((groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    
    const groupSegments = segments.filter(s => group.segments.includes(s.id));
    if (groupSegments.length === 0 && !group.parametric) return;
    
    // Create the new group
    const newGroupId = generateId();
    const newGroup: WaveformGroup = {
      id: newGroupId,
      name: `${group.name} 副本`,
      color: COLORS[groups.length % COLORS.length],
      visible: true,
      segments: [],
      ...(group.parametric ? { parametric: { ...group.parametric, startTime: group.parametric.startTime + axisConfig.xGridSize * 2 } } : {}),
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
    if (group.parametric?.kind === 'sine') {
      setGroups(prev => prev.map(item => item.id === groupId
        ? { ...item, parametric: { ...item.parametric!, startTime: item.parametric!.startTime + snapDeltaX, offset: item.parametric!.offset + snapDeltaY } }
        : item
      ));
    }
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

  // Multi-phase extension: create phaseCount-1 time-shifted copies of a group.
  // The period is user-supplied because a hand-drawn waveform has no known period;
  // phase k is shifted by k * period / phaseCount.
  const extendGroupMultiPhase = useCallback((groupId: string, phaseCount: number, period: number) => {
    const group = groups.find(g => g.id === groupId);
    if (!group || phaseCount < 2 || period <= 0) return;
    const srcSegs = segments.filter(s => group.segments.includes(s.id));
    if (srcSegs.length === 0) return;

    const newGroups: WaveformGroup[] = [];
    const allNewSegs: LineSegment[] = [];
    const usedColors = new Set(groups.map(g => g.color));

    for (let k = 1; k < phaseCount; k++) {
      const shift = (k * period) / phaseCount;
      const gid = generateId();
      const color = COLORS.find(c => !usedColors.has(c)) || COLORS[(groups.length + k) % COLORS.length];
      usedColors.add(color);

      const segs: LineSegment[] = srcSegs.map(s => ({
        id: generateId(),
        start: { x: s.start.x + shift, y: s.start.y },
        end: { x: s.end.x + shift, y: s.end.y },
        type: s.type,
        groupId: gid,
        ...(s.control ? { control: { x: s.control.x + shift, y: s.control.y } } : {}),
      }));

      newGroups.push({
        id: gid,
        name: `${group.name}_${k + 1}(${((k * 360) / phaseCount).toFixed(1)}°)`,
        color,
        visible: true,
        segments: segs.map(s => s.id),
        // Inherit the source group's rendering style
        lineWidth: group.lineWidth,
        lineStyle: group.lineStyle,
        opacity: group.opacity,
      });
      allNewSegs.push(...segs);
    }

    setSegments(prev => [...prev, ...allNewSegs]);
    setGroups(prev => [...prev, ...newGroups]);
    setTimeout(saveToHistory, 0);
  }, [groups, segments, saveToHistory]);

  // Toggle group visibility
  const toggleGroupVisibility = useCallback((groupId: string) => {
    setGroups(prev => prev.map(g => 
      g.id === groupId ? { ...g, visible: !g.visible } : g
    ));
  }, []);

  // Waveform expression evaluation (RPN; supports +, -, x, parentheses, constants, e.g. (A + B) x 0.5 - 1)
  const calculateExpression = useCallback((expression: string, rpn: CalcRpnToken[]) => {
    const result = calculateArithmeticPoints(rpn, groups, segments);
    if (!result.ok) return;

    // Build the group and segments directly and commit once (a single history entry)
    const newGroupId = generateId();
    const newSegments: LineSegment[] = [];
    for (let i = 0; i < result.points.length - 1; i++) {
      const start = result.points[i];
      const end = result.points[i + 1];
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

  const calculateLogicExpression = useCallback((expression: string, rpn: LogicRpnToken[]) => {
    const result = calculateLogicPoints(rpn, groups, segments);
    if (!result.ok || result.points.length < 2) return;

    const newGroupId = generateId();
    const newSegments: LineSegment[] = [];
    for (let index = 0; index < result.points.length - 1; index++) {
      const start = result.points[index];
      const end = result.points[index + 1];
      if (Math.abs(start.x - end.x) <= 1e-9 && Math.abs(start.y - end.y) <= 1e-9) continue;
      newSegments.push({ id: generateId(), start, end, type: 'line', groupId: newGroupId });
    }
    if (newSegments.length === 0) return;

    const newGroup: WaveformGroup = {
      id: newGroupId,
      name: expression,
      color: getNextColor(),
      visible: true,
      segments: newSegments.map(segment => segment.id),
    };
    setSegments(previous => [...previous, ...newSegments]);
    setGroups(previous => [...previous, newGroup]);
    setSelectedGroup(newGroupId);
    setTimeout(saveToHistory, 0);
  }, [groups, segments, getNextColor, saveToHistory]);

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

    const annotationIds = annotations
      .filter(annotation => {
        const bounds = getAnnotationBounds(annotation);
        return bounds.xMin >= xLo && bounds.xMax <= xHi && bounds.yMin >= yLo && bounds.yMax <= yHi;
      })
      .map(annotation => annotation.id);
    setSelectedAnnotations(previous => {
      const next = additive ? new Set(previous) : new Set<string>();
      annotationIds.forEach(id => next.add(id));
      setSelectedAnnotationState(annotationIds.at(-1) ?? (additive ? selectedAnnotation : null));
      return next;
    });
  }, [segments, groups, annotations, selectedAnnotation]);

  // Delete all selected segments (Delete/Backspace)
  const deleteSelectedSegments = useCallback(() => {
    if (selectedSegments.size === 0) return;
    applySegmentDeletion(selectedSegments);
  }, [selectedSegments, applySegmentDeletion]);

  // Delete every fully-contained visible segment and text annotation in a
  // Delete-mode rubber-band rectangle as one undoable operation.
  const deleteSegmentsInRect = useCallback((corner1: Point, corner2: Point) => {
    const xLo = Math.min(corner1.x, corner2.x);
    const xHi = Math.max(corner1.x, corner2.x);
    const yLo = Math.min(corner1.y, corner2.y);
    const yHi = Math.max(corner1.y, corner2.y);
    const inRect = (point: Point) => point.x >= xLo && point.x <= xHi && point.y >= yLo && point.y <= yHi;
    const ids = new Set(segmentsRef.current
      .filter(segment => {
        const group = groupsRef.current.find(item => item.id === segment.groupId);
        return (!group || group.visible) && inRect(segment.start) && inRect(segment.end);
      })
      .map(segment => segment.id));
    const annotationIds = new Set(getAnnotationIdsFullyInsideRect(annotationsRef.current, corner1, corner2));
    if (ids.size === 0 && annotationIds.size === 0) return;

    const deletion = deleteSegmentsAndEmptyGroups(segmentsRef.current, groupsRef.current, ids);
    const nextAnnotations = annotationsRef.current.filter(annotation => !annotationIds.has(annotation.id));
    segmentsRef.current = deletion.segments;
    groupsRef.current = deletion.groups;
    annotationsRef.current = nextAnnotations;
    setSegments(deletion.segments);
    setGroups(deletion.groups);
    setAnnotations(nextAnnotations);
    if (selectedGroup && deletion.removedGroupIds.includes(selectedGroup)) setSelectedGroup(null);
    setSelectedSegments(previous => new Set([...previous].filter(id => !ids.has(id))));
    setSelectedAnnotations(previous => new Set([...previous].filter(id => !annotationIds.has(id))));
    setSelectedAnnotationState(previous => previous && annotationIds.has(previous) ? null : previous);
    setActiveSegment(previous => previous && ids.has(previous) ? null : previous);
    pushHistoryState({
      segments: deletion.segments,
      groups: deletion.groups,
      cursors: cursorsRef.current,
      annotations: nextAnnotations,
    });
  }, [pushHistoryState, selectedGroup]);

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

  const moveSelectedAnnotations = useCallback((annotationId: string, deltaX: number, deltaY: number) => {
    const targetIds = selectedAnnotations.has(annotationId) ? selectedAnnotations : new Set([annotationId]);
    const nextAnnotations = annotationsRef.current.map(annotation => targetIds.has(annotation.id)
      ? { ...annotation, position: { x: annotation.position.x + deltaX, y: annotation.position.y + deltaY } }
      : annotation
    );
    annotationsRef.current = nextAnnotations;
    setAnnotations(nextAnnotations);
  }, [selectedAnnotations]);

  // Finish moving the selection (saves history)
  const finishMoveSelectedSegments = useCallback(() => {
    if (selectedSegments.size > 0) {
      saveToHistory();
    }
    setIsDraggingSelected(false);
    setDragStartPoint(null);
  }, [selectedSegments.size, saveToHistory]);

  // Ctrl+C: copy the selected waveforms and annotations to the internal clipboard.
  const copyToClipboard = useCallback(() => {
    const segmentsToCopy = segments.filter(s => selectedSegments.has(s.id));
    const annotationsToCopy = annotations.filter(annotation => selectedAnnotations.has(annotation.id));
    if (segmentsToCopy.length === 0 && annotationsToCopy.length === 0) return;
    setClipboardSegments(segmentsToCopy);
    setClipboardAnnotations(annotationsToCopy);
  }, [selectedSegments, selectedAnnotations, segments, annotations]);

  // Ctrl+V: enter paste preview from the clipboard
  const enterCopyPreview = useCallback((originPoint: Point) => {
    if (clipboardSegments.length === 0 && clipboardAnnotations.length === 0) return;
    
    // Create temporary segments for the preview
    const tempSegments: LineSegment[] = clipboardSegments.map(segment => ({
      ...segment,
      id: `preview-${segment.id}`, // preview id
    }));
    
    setCopyingSegments(tempSegments);
    setCopyingAnnotations(clipboardAnnotations.map(annotation => ({
      ...annotation,
      id: `preview-${annotation.id}`,
    })));
    // Initial offset 0: the preview draws at the original spot (red dashes distinguish it)
    setCopyPreviewOffset({ x: 0, y: 0 });
    setCopyOffset({ x: 0, y: 0 });
    setCopyPreviewOrigin(originPoint);
    setIsCopyPreview(true);
  }, [clipboardSegments, clipboardAnnotations]);

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

  // Confirm the paste preview - materialize the preview segments.
  // When a group is selected, the copies are pasted into that group.
  const confirmCopyPreview = useCallback(() => {
    if (copyingSegments.length === 0 && copyingAnnotations.length === 0) return;

    const newSegments = copyingSegments.map(segment => {
      const targetGroupId = selectedGroup ?? segment.groupId;
      const newSegment: LineSegment = {
        id: generateId(),
        start: { x: segment.start.x + copyPreviewOffset.x, y: segment.start.y + copyPreviewOffset.y },
        end: { x: segment.end.x + copyPreviewOffset.x, y: segment.end.y + copyPreviewOffset.y },
        type: segment.type,
        groupId: targetGroupId,
      };
      if (segment.control) {
        newSegment.control = { x: segment.control.x + copyPreviewOffset.x, y: segment.control.y + copyPreviewOffset.y };
      }
      return newSegment;
    });
    const nextSegments = [...segmentsRef.current, ...newSegments];
    const nextGroups = groupsRef.current.map(group => {
      const ids = newSegments.filter(segment => segment.groupId === group.id).map(segment => segment.id);
      return ids.length ? { ...group, segments: [...group.segments, ...ids] } : group;
    });
    const newAnnotations = copyingAnnotations.map(annotation => ({
      ...annotation,
      id: generateId(),
      position: {
        x: annotation.position.x + copyPreviewOffset.x,
        y: annotation.position.y + copyPreviewOffset.y,
      },
    }));
    const nextAnnotations = [...annotationsRef.current, ...newAnnotations];

    segmentsRef.current = nextSegments;
    groupsRef.current = nextGroups;
    annotationsRef.current = nextAnnotations;
    setSegments(nextSegments);
    setGroups(nextGroups);
    setAnnotations(nextAnnotations);
    
    // Clear the paste preview state
    setIsCopyPreview(false);
    setCopyingSegments([]);
    setCopyingAnnotations([]);
    setCopyPreviewOffset({ x: 0, y: 0 });
    setCopyOffset({ x: 0, y: 0 });
    setCopyPreviewOrigin(null);
    setSelectedSegments(new Set(newSegments.map(segment => segment.id)));
    setSelectedAnnotations(new Set(newAnnotations.map(annotation => annotation.id)));
    setSelectedAnnotationState(newAnnotations.at(-1)?.id ?? null);
    pushHistoryState({ segments: nextSegments, groups: nextGroups, cursors: cursorsRef.current, annotations: nextAnnotations });
  }, [copyingSegments, copyingAnnotations, copyPreviewOffset, selectedGroup, pushHistoryState]);

  // Cancel the paste preview
  const cancelCopyPreview = useCallback(() => {
    setIsCopyPreview(false);
    setCopyingSegments([]);
    setCopyingAnnotations([]);
    setCopyPreviewOffset({ x: 0, y: 0 });
    setCopyOffset({ x: 0, y: 0 });
    setCopyPreviewOrigin(null);
  }, []);

  // Direct paste for touch devices (no keyboard): drop clipboard content
  // offset by two grid cells and select them, so the user can finger-drag to reposition.
  // When a group is selected, the copies are pasted into that group.
  const pasteClipboard = useCallback(() => {
    if (clipboardSegments.length === 0 && clipboardAnnotations.length === 0) return;
    const dx = axisConfig.xGridSize * 2;
    const dy = axisConfig.yGridSize * 2;

    const newSegs: LineSegment[] = clipboardSegments.map(seg => ({
      id: generateId(),
      start: { x: seg.start.x + dx, y: seg.start.y + dy },
      end: { x: seg.end.x + dx, y: seg.end.y + dy },
      type: seg.type,
      groupId: selectedGroup ?? seg.groupId,
      ...(seg.control ? { control: { x: seg.control.x + dx, y: seg.control.y + dy } } : {}),
    }));

    const nextSegments = [...segmentsRef.current, ...newSegs];
    const nextGroups = groupsRef.current.map(g => {
      const ids = newSegs.filter(s => s.groupId === g.id).map(s => s.id);
      return ids.length ? { ...g, segments: [...g.segments, ...ids] } : g;
    });
    const newAnnotations = clipboardAnnotations.map(annotation => ({
      ...annotation,
      id: generateId(),
      position: { x: annotation.position.x + dx, y: annotation.position.y + dy },
    }));
    const nextAnnotations = [...annotationsRef.current, ...newAnnotations];

    segmentsRef.current = nextSegments;
    groupsRef.current = nextGroups;
    annotationsRef.current = nextAnnotations;
    setSegments(nextSegments);
    setGroups(nextGroups);
    setAnnotations(nextAnnotations);
    setSelectedSegments(new Set(newSegs.map(s => s.id)));
    setSelectedAnnotations(new Set(newAnnotations.map(annotation => annotation.id)));
    setSelectedAnnotationState(newAnnotations.at(-1)?.id ?? null);
    pushHistoryState({ segments: nextSegments, groups: nextGroups, cursors: cursorsRef.current, annotations: nextAnnotations });
  }, [clipboardSegments, clipboardAnnotations, axisConfig.xGridSize, axisConfig.yGridSize, selectedGroup, pushHistoryState]);

  const createAnnotation = useCallback((position: Point, initialText: string) => {
    const annotation: TextAnnotation = {
      id: generateId(),
      text: initialText,
      position,
      ...DEFAULT_ANNOTATION_STYLE,
    };
    const nextAnnotations = [...annotationsRef.current, annotation];
    annotationsRef.current = nextAnnotations;
    setAnnotations(nextAnnotations);
    setSelectedAnnotation(annotation.id);
    pushHistoryState({
      segments: segmentsRef.current,
      groups: groupsRef.current,
      cursors: cursorsRef.current,
      annotations: nextAnnotations,
    });
    return annotation.id;
  }, [pushHistoryState, setSelectedAnnotation]);

  const updateAnnotation = useCallback((annotationId: string, patch: Partial<Omit<TextAnnotation, 'id'>>, saveHistory = false) => {
    const nextAnnotations = annotationsRef.current.map(annotation => annotation.id === annotationId
      ? { ...annotation, ...patch, fontSize: patch.fontSize === undefined ? annotation.fontSize : Math.max(0.1, patch.fontSize) }
      : annotation
    );
    annotationsRef.current = nextAnnotations;
    setAnnotations(nextAnnotations);
    if (saveHistory) {
      pushHistoryState({ segments: segmentsRef.current, groups: groupsRef.current, cursors: cursorsRef.current, annotations: nextAnnotations });
    }
  }, [pushHistoryState]);

  const commitAnnotationChange = useCallback(() => {
    pushHistoryState({
      segments: segmentsRef.current,
      groups: groupsRef.current,
      cursors: cursorsRef.current,
      annotations: annotationsRef.current,
    });
  }, [pushHistoryState]);

  const deleteAnnotation = useCallback((annotationId: string) => {
    const nextAnnotations = annotationsRef.current.filter(annotation => annotation.id !== annotationId);
    if (nextAnnotations.length === annotationsRef.current.length) return;
    annotationsRef.current = nextAnnotations;
    setAnnotations(nextAnnotations);
    setSelectedAnnotations(previous => new Set([...previous].filter(id => id !== annotationId)));
    setSelectedAnnotationState(current => current === annotationId ? null : current);
    pushHistoryState({ segments: segmentsRef.current, groups: groupsRef.current, cursors: cursorsRef.current, annotations: nextAnnotations });
  }, [pushHistoryState]);

  const deleteSelectedContent = useCallback(() => {
    if (selectedSegments.size === 0 && selectedAnnotations.size === 0) return;
    const deletion = deleteSegmentsAndEmptyGroups(segmentsRef.current, groupsRef.current, selectedSegments);
    const nextAnnotations = annotationsRef.current.filter(annotation => !selectedAnnotations.has(annotation.id));
    segmentsRef.current = deletion.segments;
    groupsRef.current = deletion.groups;
    annotationsRef.current = nextAnnotations;
    setSegments(deletion.segments);
    setGroups(deletion.groups);
    setAnnotations(nextAnnotations);
    setSelectedSegments(new Set());
    setSelectedAnnotations(new Set());
    setSelectedAnnotationState(null);
    setActiveSegment(null);
    if (selectedGroup && deletion.removedGroupIds.includes(selectedGroup)) setSelectedGroup(null);
    pushHistoryState({
      segments: deletion.segments,
      groups: deletion.groups,
      cursors: cursorsRef.current,
      annotations: nextAnnotations,
    });
  }, [pushHistoryState, selectedAnnotations, selectedGroup, selectedSegments]);

  // Clear all
  const clearAll = useCallback(() => {
    segmentsRef.current = [];
    groupsRef.current = [];
    cursorsRef.current = [];
    annotationsRef.current = [];
    setSegments([]);
    setGroups([]);
    setCursors([]);
    setAnnotations([]);
    setSelectedAnnotation(null);
    setSelectedGroup(null);
    setActiveSegment(null);
    setSelectedSegments(new Set());
    pushHistoryState({ segments: [], groups: [], cursors: [], annotations: [] });
  }, [pushHistoryState, setSelectedAnnotation]);

  // Build the export SVG (bounds auto-fit the visible waveforms, aligned outward to the major grid)
  const buildSVG = useCallback((options: SvgBuildOptions = {}): { svg: string; width: number; height: number } => {
    const {
      includeBackground = true,
      alignBoundsToGrid = true,
      contentPadding = 60,
      includeGrid = true,
      includeAxes = true,
      includeLegend = false,
      includeCursors = false,
      includeAnnotations = true,
      selectionOnly = false,
    } = options;
    const padding = contentPadding;
    const exportSegments = selectionOnly
      ? segments.filter(segment => selectedSegments.has(segment.id))
      : segments;
    const exportGroups = selectionOnly
      ? groups.filter(group => exportSegments.some(segment => segment.groupId === group.id))
      : groups;
    const exportAnnotations = includeAnnotations
      ? (selectionOnly ? annotations.filter(annotation => selectedAnnotations.has(annotation.id)) : annotations)
      : [];

    // Bounding box of visible waveforms and world-anchored text annotations
    const visibleSegments = exportSegments.filter(s => {
      const g = exportGroups.find(g => g.id === s.groupId);
      return !g || g.visible;
    });
    const visibleParametric = selectionOnly ? [] : exportGroups.filter(group => group.visible && group.parametric?.kind === 'sine');

    let xMin = -10, xMax = 10, yMin = -5, yMax = 5; // default range when there are no waveforms
    if (visibleSegments.length > 0 || visibleParametric.length > 0 || exportAnnotations.length > 0) {
      xMin = Infinity; xMax = -Infinity; yMin = Infinity; yMax = -Infinity;
      visibleSegments.forEach(s => {
        const pts = s.control ? [s.start, s.end, s.control] : [s.start, s.end];
        pts.forEach(p => {
          xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x);
          yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y);
        });
      });
      visibleParametric.forEach(group => {
        const sine = group.parametric!;
        xMin = Math.min(xMin, sine.startTime);
        xMax = Math.max(xMax, sine.startTime + sine.period * sine.totalCycles);
        yMin = Math.min(yMin, sine.offset - Math.abs(sine.amplitude));
        yMax = Math.max(yMax, sine.offset + Math.abs(sine.amplitude));
      });
      exportAnnotations.forEach(annotation => {
        const bounds = getAnnotationBounds(annotation);
        xMin = Math.min(xMin, bounds.xMin); xMax = Math.max(xMax, bounds.xMax);
        yMin = Math.min(yMin, bounds.yMin); yMax = Math.max(yMax, bounds.yMax);
      });
      if (alignBoundsToGrid) {
        // Full image export keeps the existing grid-aligned framing.
        xMin = (Math.floor(xMin / axisConfig.xMajorGridSize) - 1) * axisConfig.xMajorGridSize;
        xMax = (Math.ceil(xMax / axisConfig.xMajorGridSize) + 1) * axisConfig.xMajorGridSize;
        yMin = (Math.floor(yMin / axisConfig.yMajorGridSize) - 1) * axisConfig.yMajorGridSize;
        yMax = (Math.ceil(yMax / axisConfig.yMajorGridSize) + 1) * axisConfig.yMajorGridSize;
      } else {
        // Clipboard images fit the copied content. Give zero-width/height
        // selections a minimal world-space extent so transforms stay finite.
        if (Math.abs(xMax - xMin) < 1e-9) {
          const halfRange = Math.max(axisConfig.xGridSize, 0.001) / 2;
          xMin -= halfRange;
          xMax += halfRange;
        }
        if (Math.abs(yMax - yMin) < 1e-9) {
          const halfRange = Math.max(axisConfig.yGridSize, 0.001) / 2;
          yMin -= halfRange;
          yMax += halfRange;
        }
      }
    }

    const xRange = xMax - xMin;
    const yRange = yMax - yMin;
    // Pixels per world unit: 40 by default, reduced for large ranges to keep the export under ~2000px
    const pxPerUnit = Math.min(40, 1880 / xRange, 1880 / yRange);
    const width = Math.round(2 * padding + xRange * pxPerUnit);
    const plotHeight = Math.round(2 * padding + yRange * pxPerUnit);
    const chartWidth = width - 2 * padding;
    const chartHeight = plotHeight - 2 * padding;
    const legendGroups = includeLegend
      ? exportGroups.filter(group => group.visible && (group.segments.some(id => exportSegments.some(segment => segment.id === id)) || !!group.parametric))
      : [];
    const legendLayout = layoutSvgLegend(legendGroups, chartWidth);
    const legendGap = legendLayout.height > 0 ? 24 : 0;
    const height = plotHeight + legendGap + legendLayout.height;

    // Coordinate transform
    const worldToSVG = (point: Point): Point => ({
      x: padding + ((point.x - xMin) / xRange) * chartWidth,
      y: plotHeight - padding - ((point.y - yMin) / yRange) * chartHeight,
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
    const generateParametricPath = (sine: ParametricSine): string =>
      sampleParametricSine(sine).map((point, index) => {
        const svgPoint = worldToSVG(point);
        return `${index === 0 ? 'M' : 'L'} ${svgPoint.x.toFixed(2)} ${svgPoint.y.toFixed(2)}`;
      }).join(' ');



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
`;
    if (includeBackground) {
      svg += `  <!-- 背景 -->
  <rect width="${width}" height="${height}" fill="white"/>
`;
    }

    // Integer-index loops avoid float accumulation error
    const isMajor = (v: number, major: number) =>
      Math.abs(v / major - Math.round(v / major)) < 1e-6;

    const xMajorIndexStart = Math.ceil(xMin / axisConfig.xMajorGridSize);
    const xMajorIndexEnd = Math.floor(xMax / axisConfig.xMajorGridSize + 1e-9);
    const yMajorIndexStart = Math.ceil(yMin / axisConfig.yMajorGridSize);
    const yMajorIndexEnd = Math.floor(yMax / axisConfig.yMajorGridSize + 1e-9);

    if (includeGrid) {
    svg += `
  <!-- 次网格线 -->
  <g id="grid-minor">
`;
    // Vertical minor grid lines
    for (let i = Math.ceil(xMin / axisConfig.xGridSize); i * axisConfig.xGridSize <= xMax + 1e-9; i++) {
      const x = i * axisConfig.xGridSize;
      if (isMajor(x, axisConfig.xMajorGridSize)) continue;
      const screenX = worldToSVG({ x, y: 0 }).x;
      svg += `    <line ${MINOR_STYLE} x1="${screenX.toFixed(2)}" y1="${padding}" x2="${screenX.toFixed(2)}" y2="${plotHeight - padding}"/>\n`;
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
    for (let i = xMajorIndexStart; i <= xMajorIndexEnd; i++) {
      const screenX = worldToSVG({ x: i * axisConfig.xMajorGridSize, y: 0 }).x;
      svg += `    <line ${MAJOR_STYLE} x1="${screenX.toFixed(2)}" y1="${padding}" x2="${screenX.toFixed(2)}" y2="${plotHeight - padding}"/>\n`;
    }

    // Horizontal major grid lines
    for (let i = yMajorIndexStart; i <= yMajorIndexEnd; i++) {
      const screenY = worldToSVG({ x: 0, y: i * axisConfig.yMajorGridSize }).y;
      svg += `    <line ${MAJOR_STYLE} x1="${padding}" y1="${screenY.toFixed(2)}" x2="${width - padding}" y2="${screenY.toFixed(2)}"/>\n`;
    }

    svg += `  </g>
`;
    }

    if (includeAxes) {
    svg += `
  <!-- 坐标轴 -->
  <g id="axes">
`;

    // Axes are drawn only when the origin falls inside the range; otherwise tick labels hug the edge
    const hasXAxis = yMin <= 0 && yMax >= 0;
    const hasYAxis = xMin <= 0 && xMax >= 0;
    const originY = hasXAxis ? worldToSVG({ x: 0, y: 0 }).y : plotHeight - padding;
    const originX = hasYAxis ? worldToSVG({ x: 0, y: 0 }).x : padding;

    if (hasXAxis) {
      svg += `    <line ${AXIS_STYLE} x1="${padding}" y1="${originY.toFixed(2)}" x2="${width - padding}" y2="${originY.toFixed(2)}"/>\n`;
    }
    if (hasYAxis) {
      svg += `    <line ${AXIS_STYLE} x1="${originX.toFixed(2)}" y1="${padding}" x2="${originX.toFixed(2)}" y2="${plotHeight - padding}"/>\n`;
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
`;
    }

    svg += `
  <!-- 波形（按组分层，Visio中取消组合可逐级拆到单条线段） -->
  <g id="waveforms">
`;

    // Orphaned legacy segments sit below every named group.
    const orphanSegments = exportSegments.filter(s => !exportGroups.some(g => g.id === s.groupId));
    if (orphanSegments.length > 0) {
      svg += `    <g id="wave-group-ungrouped">\n`;
      orphanSegments.forEach(segment => {
        svg += `      <path d="${generatePath(segment)}" stroke="#3b82f6" stroke-width="${DEFAULT_LINE_WIDTH}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>\n`;
      });
      svg += `    </g>\n`;
    }

    // groups[0] is topmost, so SVG paints the list in reverse order.
    groupsBottomToTop(exportGroups).forEach((group) => {
      if (!group.visible) return;
      const groupSegments = exportSegments.filter(s => s.groupId === group.id);
      if (groupSegments.length === 0 && !group.parametric) return;

      // Per-group style: width, dash pattern, opacity
      const width = group.lineWidth ?? DEFAULT_LINE_WIDTH;
      const dash = LINE_DASH[group.lineStyle ?? 'solid'];
      const dashAttr = dash.length ? ` stroke-dasharray="${dash.join(',')}"` : '';
      const opacity = group.opacity ?? 1;
      const opacityAttr = opacity < 1 ? ` stroke-opacity="${opacity}"` : '';

      const groupNumber = exportGroups.findIndex(item => item.id === group.id) + 1;
      svg += `    <g id="wave-group-${groupNumber}">\n      <title>${escapeXml(group.name)}</title>\n`;
      if (group.parametric?.kind === 'sine' && groupSegments.length === 0) {
          svg += `      <path d="${generateParametricPath(group.parametric)}" stroke="${group.color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${dashAttr}${opacityAttr} fill="none"/>\n`;
      } else {
        groupSegments.forEach(segment => {
          svg += `      <path d="${generatePath(segment)}" stroke="${group.color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${dashAttr}${opacityAttr} fill="none"/>\n`;
        });
      }
      svg += `    </g>\n`;
    });

    svg += `  </g>\n`;

    if (includeCursors) {
      svg += renderSvgCursors(cursors, {
        xMin, xMax, yMin, yMax, padding, width, plotHeight, axisConfig,
        worldToSvg: worldToSVG,
      });
    }

    // Painted last so annotations remain above the waveform layer and stay as
    // native, editable SVG text elements.
    svg += renderSvgAnnotations(exportAnnotations, worldToSVG, pxPerUnit);

    svg += renderSvgLegend(legendLayout, padding, plotHeight);
    svg += `</svg>`;

    return { svg, width, height };
  }, [segments, groups, cursors, annotations, selectedSegments, selectedAnnotations, axisConfig]);

  const buildExportSVG = useCallback((options: Omit<ImageExportOptions, 'format'>): string => (
    buildSVG({
      includeGrid: options.includeGrid,
      includeAxes: options.includeAxes,
      includeLegend: options.includeLegend,
      includeCursors: options.includeCursors,
    }).svg
  ), [buildSVG]);

  const rasterizeSvgToPng = useCallback((svg: string, width: number, height: number, scaleFactor = 3): Promise<Blob> => (
    new Promise((resolve, reject) => {
      const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scaleFactor);
        canvas.height = Math.round(height * scaleFactor);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(svgUrl);
          reject(new Error('Canvas 2D context unavailable'));
          return;
        }
        ctx.scale(scaleFactor, scaleFactor);
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(svgUrl);
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png');
      };
      img.onerror = () => {
        URL.revokeObjectURL(svgUrl);
        reject(new Error('SVG rasterization failed'));
      };
      img.src = svgUrl;
    })
  ), []);

  const downloadImage = useCallback(async (options: ImageExportOptions, filename?: string) => {
    const built = buildSVG({
      includeGrid: options.includeGrid,
      includeAxes: options.includeAxes,
      includeLegend: options.includeLegend,
      includeCursors: options.includeCursors,
    });
    const blob = options.format === 'svg'
      ? new Blob([built.svg], { type: 'image/svg+xml;charset=utf-8' })
      : await rasterizeSvgToPng(built.svg, built.width, built.height);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename ?? `waveform.${options.format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [buildSVG, rasterizeSvgToPng]);

  // Download as SVG
  const downloadSVG = useCallback((filename: string = 'waveform.svg') => downloadImage({ format: 'svg', includeGrid: true, includeAxes: true, includeLegend: true, includeCursors: includeCursorsInExport }, filename), [downloadImage, includeCursorsInExport]);

  // Download as PNG (hi-res, 3x render by default)
  const downloadPNG = useCallback((filename: string = 'waveform.png') => downloadImage({ format: 'png', includeGrid: true, includeAxes: true, includeLegend: true, includeCursors: includeCursorsInExport }, filename), [downloadImage, includeCursorsInExport]);

  const copySelectedToSystemClipboard = useCallback(async () => {
    if ((selectedSegments.size === 0 && selectedAnnotations.size === 0) || typeof navigator.clipboard?.write !== 'function' || typeof ClipboardItem === 'undefined') return false;
    const clipboardOptions: SvgBuildOptions = {
      alignBoundsToGrid: false,
      contentPadding: 12,
      includeBackground: false,
      includeGrid: false,
      includeAxes: false,
      includeLegend: false,
      includeCursors: false,
      includeAnnotations: true,
      selectionOnly: true,
    };
    const svgBuilt = buildSVG(clipboardOptions);
    const pngBuilt = buildSVG({ ...clipboardOptions, includeBackground: true });
    const clipboardData: Record<string, Blob> = {
      'image/svg+xml': new Blob([svgBuilt.svg], { type: 'image/svg+xml' }),
      'image/png': await rasterizeSvgToPng(pngBuilt.svg, pngBuilt.width, pngBuilt.height, 2),
    };
    await navigator.clipboard.write([new ClipboardItem(clipboardData)]);
    return true;
  }, [buildSVG, rasterizeSvgToPng, selectedAnnotations.size, selectedSegments.size]);

  // Export the waveform data as a JSON object
  const exportData = useCallback(() => {
    return {
      version: '2.1',
      exportTime: new Date().toISOString(),
      axisConfig,
      viewport,
      groups,
      segments,
      cursors,
      annotations,
    };
  }, [axisConfig, viewport, groups, segments, cursors, annotations]);

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
    viewport?: Partial<Viewport> & { scale?: number };
    groups?: WaveformGroup[];
    segments?: LineSegment[];
    cursors?: unknown;
    annotations?: unknown;
  }) => {
    // Import the axis config if present, keeping only known fields
    if (data.axisConfig) {
      const a = data.axisConfig;
      setAxisConfig(normalizeAxisConfig(a));
    }

    // Restore the viewport (2.0+ only; older files keep the current one).
    // normalizeViewport migrates the legacy uniform `scale` field.
    if (data.viewport) {
      setViewport(normalizeViewport(data.viewport));
    }
    
    // Import groups and segments
    const nextGroups = data.groups && data.segments ? data.groups : groupsRef.current;
    const nextSegments = data.groups && data.segments ? data.segments : segmentsRef.current;
    const nextCursors = sanitizeAxisCursors(data.cursors);
    const nextAnnotations = sanitizeAnnotations(data.annotations);
    groupsRef.current = nextGroups;
    segmentsRef.current = nextSegments;
    cursorsRef.current = nextCursors;
    annotationsRef.current = nextAnnotations;
    setGroups(nextGroups);
    setSegments(nextSegments);
    setCursors(nextCursors);
    setAnnotations(nextAnnotations);
    
    // Clear selection state
    setSelectedGroup(null);
    setSelectedSegments(new Set());
    setActiveSegment(null);
    setSelectedAnnotation(null);
    pushHistoryState({ segments: nextSegments, groups: nextGroups, cursors: nextCursors, annotations: nextAnnotations });
  }, [pushHistoryState, setAxisConfig, setSelectedAnnotation]);

  // Generate common waveforms.
  // For square/trapezoid, params.complementary additionally creates the complementary
  // drive signal: it is high while the primary is low, shrunk by deadTimePercent of
  // the period on each switching transition (both signals low during the dead band).
  const generateWaveform = useCallback((
    type: WaveformType,
    params: GenerateParams,
    groupName: string,
    customColor?: string,
    skipHistorySave?: boolean,
    complementaryName?: string
  ) => {
    const points = buildWaveformPoints(type, params);
    if (points.length < 2) return;

    // Connect points into segments for one group (skipping zero-length ones)
    const toSegments = (pts: Point[], gid: string): LineSegment[] => {
      const segs: LineSegment[] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const start = pts[i];
        const end = pts[i + 1];
        if (start.x === end.x && start.y === end.y) continue;
        segs.push({ id: generateId(), start, end, type: 'line', groupId: gid });
      }
      return segs;
    };

    const primaryId = generateId();
    const primaryColor = customColor || getNextColor();
    // Smooth basic waveforms use one editable curve per half-period, rather
    // than dense samples or one globally coupled parametric object.
    const primarySegs = type === 'sine'
      ? buildSineHalfCycleSegments(params, primaryId)
      : type === 'rectified'
        ? buildRectifiedHalfCycleSegments(params, primaryId)
        : type === 'damped'
          ? buildDampedHalfCycleSegments(params, primaryId)
          : toSegments(points, primaryId);
    const newGroups: WaveformGroup[] = [{
      id: primaryId,
      name: groupName,
      color: primaryColor,
      visible: true,
      segments: primarySegs.map(s => s.id),
    }];
    let allSegs = primarySegs;

    // Complementary signal (square/trapezoid only)
    if (params.complementary && (type === 'square' || type === 'trapezoid') && complementaryName) {
      const dt = Math.max(0, params.deadTimePercent ?? 5);
      const compDuty = Math.max(0, 100 - params.dutyCycle - 2 * dt);
      const compParams: GenerateParams = {
        ...params,
        dutyCycle: compDuty,
        startTime: params.startTime + ((params.dutyCycle + dt) / 100) * params.period,
      };
      const compPoints = buildWaveformPoints(type, compParams);
      const compId = generateId();
      // Pick a color distinct from both existing groups and the primary
      const used = new Set([...groups.map(g => g.color), primaryColor]);
      const compColor = COLORS.find(c => !used.has(c)) || COLORS[(groups.length + 1) % COLORS.length];
      const compSegs = toSegments(compPoints, compId);
      newGroups.push({
        id: compId,
        name: complementaryName,
        color: compColor,
        visible: true,
        segments: compSegs.map(s => s.id),
      });
      allSegs = [...allSegs, ...compSegs];
    }

    setSegments(prev => [...prev, ...allSegs]);
    setGroups(prev => [...prev, ...newGroups]);
    setSelectedGroup(primaryId);
    if (!skipHistorySave) {
      setTimeout(saveToHistory, 0);
    }
  }, [saveToHistory, getNextColor, groups]);

  const updateParametricSine = useCallback((groupId: string, next: ParametricSine, saveHistory = true) => {
    const group = groups.find(g => g.id === groupId);
    if (!group || group.parametric?.kind !== 'sine') return;

    const params: GenerateParams = {
      amplitude: next.amplitude,
      period: Math.max(0.001, next.period),
      dutyCycle: 50,
      totalCycles: Math.max(1, Math.floor(next.totalCycles)),
      startTime: next.startTime,
      phaseShift: next.phaseShift,
      offset: next.offset,
    };
    const oldIds = new Set(group.segments);
    const normalized: ParametricSine = {
      ...next,
      period: params.period,
      totalCycles: params.totalCycles,
    };

    setSegments(prev => prev.filter(segment => !oldIds.has(segment.id)));
    setGroups(prev => prev.map(item => item.id === groupId
      ? { ...item, segments: [], parametric: normalized }
      : item
    ));
    if (saveHistory) setTimeout(saveToHistory, 0);
  }, [groups, saveToHistory]);

  // Create a vertically separated, time-aligned set of common DC/DC paper waveforms.
  // The traces are deliberately normalized reference shapes, not a circuit simulator.
  const generateDcdcTemplate = useCallback((template: DcdcTemplate, params: DcdcTemplateParams) => {
    const traces = buildDcdcTemplate(template, params);
    if (traces.length === 0) return;

    const newGroups: WaveformGroup[] = [];
    const newSegments: LineSegment[] = [];
    traces.forEach((trace) => {
      const groupId = generateId();
      const traceSegments: LineSegment[] = [];
      for (let i = 0; i < trace.points.length - 1; i++) {
        const start = trace.points[i];
        const end = trace.points[i + 1];
        if (start.x === end.x && start.y === end.y) continue;
        traceSegments.push({ id: generateId(), start, end, type: 'line', groupId });
      }
      newSegments.push(...traceSegments);
      newGroups.push({
        id: groupId,
        name: trace.name,
        color: trace.color,
        visible: true,
        segments: traceSegments.map(segment => segment.id),
      });
    });

    setSegments(prev => [...prev, ...newSegments]);
    setGroups(prev => [...prev, ...newGroups]);
    setSelectedGroup(newGroups[0].id);
    setTimeout(saveToHistory, 0);
  }, [saveToHistory]);

  return {
    segments,
    groups,
    cursors,
    annotations,
    selectedAnnotation,
    selectedAnnotations,
    includeCursorsInExport,
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
    copyingAnnotations,
    copyOffset,
    isDraggingSelected,
    dragStartPoint,
    isCopyPreview,
    copyPreviewOffset,
    clipboardSegments,
    clipboardAnnotations,
    saveToHistory,
    canvasRef,
    setAxisConfig,
    setMode,
    setSelectedGroup,
    setSelectedAnnotation,
    selectAnnotation,
    setActiveSegment,
    setIsDrawing,
    setDrawStart,
    setCurrentMouse,
    setIncludeCursorsInExport,
    setDraggingControl,
    setMovingGroup,
    setMoveStartPoint,
    setIsDraggingSelected,
    setDragStartPoint,
    worldToScreen,
    screenToWorld,
    snapToGrid,
    createCursor,
    updateCursor,
    commitCursorChange,
    toggleCursorVisibility,
    deleteCursor,
    focusCursor,
    addSegment,
    updateControlPoint,
    addControlPoint,
    deleteSegment,
    createGroup,
    deleteGroup,
    renameGroup,
    reorderGroups,
    changeGroupColor,
    changeGroupStyle,
    duplicateGroup,
    moveGroup,
    finishMoveGroup,
    moveSegmentEndpoint,
    toggleGroupVisibility,
    toggleSegmentSelection,
    clearSegmentSelection,
    selectSegmentsInRect,
    deleteSelectedSegments,
    deleteSegmentsInRect,
    moveSelectedSegments,
    moveSelectedAnnotations,
    finishMoveSelectedSegments,
    copyToClipboard,
    enterCopyPreview,
    updateCopyPreviewOffset,
    confirmCopyPreview,
    cancelCopyPreview,
    pasteClipboard,
    createAnnotation,
    updateAnnotation,
    commitAnnotationChange,
    deleteAnnotation,
    deleteSelectedContent,
    calculateExpression,
    calculateLogicExpression,
    clearAll,
    undo,
    redo,
    downloadSVG,
    downloadPNG,
    buildExportSVG,
    downloadImage,
    copySelectedToSystemClipboard,
    downloadJSON,
    importData,
    generateWaveform,
    updateParametricSine,
    generateDcdcTemplate,
    extendGroupMultiPhase,
  };
}
