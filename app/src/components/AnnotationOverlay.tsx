import React from 'react';
import { createPortal } from 'react-dom';
import type { AnnotationRunStyle, AnnotationTextRun, Point, TextAnnotation, ToolMode, Viewport } from '@/types/waveform';
import { AnnotationCharacterControls, AnnotationEditorFields, type WaveformColorOption } from '@/components/AnnotationControls';
import { ANNOTATION_CHARACTER_STYLE_KEYS, applyAnnotationRunStyle, clearAnnotationRunOverrides, getAnnotationRuns, getEffectiveAnnotationRunStyle, mergeAnnotationRuns, type AnnotationCharacterStyleKey } from '@/lib/annotation';

interface TextSelectionRange { start: number; end: number }

const EDITOR_CARET_MARKER = '\u200b';
const stripEditorCaretMarkers = (value: string) => value.replaceAll(EDITOR_CARET_MARKER, '');
const logicalTextOffsetToDomOffset = (value: string, logicalOffset: number) => {
  if (logicalOffset <= 0) return 0;
  let logicalLength = 0;
  for (let domOffset = 0; domOffset < value.length; domOffset += 1) {
    if (value[domOffset] !== EDITOR_CARET_MARKER) logicalLength += 1;
    if (value[domOffset] !== EDITOR_CARET_MARKER && logicalLength >= logicalOffset) return domOffset + 1;
  }
  return value.length;
};

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const runsToHtml = (annotation: TextAnnotation, runs: AnnotationTextRun[]) => runs.map(run => {
  const tag = run.verticalAlign === 'super' ? 'sup' : run.verticalAlign === 'sub' ? 'sub' : 'span';
  const style = [
    run.color ? `color:${escapeHtml(run.color)}` : '',
    run.fontFamily ? `font-family:${escapeHtml(run.fontFamily)}` : '',
    run.fontSize ? `font-size:${run.fontSize / annotation.fontSize}em` : '',
    run.fontWeight ? `font-weight:${run.fontWeight}` : '',
    run.fontStyle ? `font-style:${run.fontStyle}` : '',
  ].filter(Boolean).join(';');
  const data = [
    run.color ? `data-color="${escapeHtml(run.color)}"` : '',
    run.fontFamily ? `data-font-family="${escapeHtml(run.fontFamily)}"` : '',
    run.fontSize ? `data-font-size="${run.fontSize}"` : '',
    run.fontWeight ? `data-font-weight="${run.fontWeight}"` : '',
    run.fontStyle ? `data-font-style="${run.fontStyle}"` : '',
    run.verticalAlign ? `data-vertical-align="${run.verticalAlign}"` : '',
  ].filter(Boolean).join(' ');
  return `<${tag}${style ? ` style="${style}"` : ''}${data ? ` ${data}` : ''}>${escapeHtml(run.text).replace(/\n/g, `<br>${EDITOR_CARET_MARKER}`)}</${tag}>`;
}).join('');

const nodeTextLength = (node: Node): number => {
  if (node.nodeType === Node.TEXT_NODE) return stripEditorCaretMarkers(node.textContent ?? '').length;
  if (node.nodeName === 'BR') return 1;
  return Array.from(node.childNodes).reduce((length, child) => length + nodeTextLength(child), 0);
};

const domPointOffset = (root: HTMLElement, target: Node, targetOffset: number) => {
  let total = 0;
  let result: number | null = null;
  const visit = (node: Node) => {
    if (result !== null) return;
    if (node === target) {
      if (node.nodeType === Node.TEXT_NODE) result = total + stripEditorCaretMarkers((node.textContent ?? '').slice(0, targetOffset)).length;
      else result = total + Array.from(node.childNodes).slice(0, targetOffset).reduce((length, child) => length + nodeTextLength(child), 0);
      return;
    }
    if (node.nodeType === Node.TEXT_NODE || node.nodeName === 'BR') total += nodeTextLength(node);
    else Array.from(node.childNodes).forEach(visit);
  };
  visit(root);
  return result ?? total;
};

const getEditorSelection = (root: HTMLElement): TextSelectionRange | null => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const start = domPointOffset(root, range.startContainer, range.startOffset);
  const end = domPointOffset(root, range.endContainer, range.endOffset);
  return { start: Math.min(start, end), end: Math.max(start, end) };
};

const domPositionAtOffset = (root: HTMLElement, requestedOffset: number) => {
  let remaining = Math.max(0, requestedOffset);
  let result: { node: Node; offset: number } | null = null;
  const visit = (node: Node) => {
    if (result) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      const length = stripEditorCaretMarkers(text).length;
      if (remaining <= length) result = { node, offset: logicalTextOffsetToDomOffset(text, remaining) };
      else remaining -= length;
      return;
    }
    if (node.nodeName === 'BR') {
      const parent = node.parentNode;
      if (remaining <= 1 && parent) result = { node: parent, offset: Array.from(parent.childNodes).indexOf(node as ChildNode) + (remaining === 0 ? 0 : 1) };
      else remaining -= 1;
      return;
    }
    Array.from(node.childNodes).forEach(visit);
  };
  visit(root);
  return result ?? { node: root, offset: root.childNodes.length };
};

const restoreEditorSelection = (root: HTMLElement, selectionRange: TextSelectionRange) => {
  const start = domPositionAtOffset(root, selectionRange.start);
  const end = domPositionAtOffset(root, selectionRange.end);
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
};

const getFormattingValue = (annotation: TextAnnotation, runs: AnnotationTextRun[], offset: number): Required<AnnotationRunStyle> => {
  let cursor = 0;
  const run = runs.find((candidate, index) => {
    cursor += candidate.text.length;
    return offset < cursor || (index === runs.length - 1 && offset === cursor);
  }) ?? { text: '' };
  const style = getEffectiveAnnotationRunStyle(annotation, run);
  return {
    color: style.color,
    fontFamily: style.fontFamily,
    fontSize: style.sourceFontSize,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    verticalAlign: style.verticalAlign,
  };
};

const getBoxFormattingValue = (annotation: TextAnnotation): Required<AnnotationRunStyle> => {
  const runs = getAnnotationRuns(annotation);
  const firstVerticalAlign = runs[0]?.verticalAlign ?? 'baseline';
  return {
    color: annotation.color,
    fontFamily: annotation.fontFamily,
    fontSize: annotation.fontSize,
    fontWeight: annotation.fontWeight,
    fontStyle: annotation.fontStyle,
    verticalAlign: runs.every(run => (run.verticalAlign ?? 'baseline') === firstVerticalAlign) ? firstVerticalAlign : 'baseline',
  };
};

const runsHaveOverrides = (runs: AnnotationTextRun[]) => runs.some(run => (
  ANNOTATION_CHARACTER_STYLE_KEYS.some(key => run[key] !== undefined)
));

const normalizeStoredRuns = (runs: AnnotationTextRun[]) => runsHaveOverrides(runs) ? mergeAnnotationRuns(runs) : undefined;

const annotationContentSnapshot = (annotation: TextAnnotation) => JSON.stringify({
  text: annotation.text,
  color: annotation.color,
  fontFamily: annotation.fontFamily,
  fontSize: annotation.fontSize,
  fontWeight: annotation.fontWeight,
  fontStyle: annotation.fontStyle,
  textAnchor: annotation.textAnchor,
  runs: annotation.runs,
});

interface AnnotationOverlayProps {
  annotations: TextAnnotation[];
  previewAnnotations?: TextAnnotation[];
  previewOffset?: Point;
  selectedAnnotations: Set<string>;
  mode: ToolMode;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  viewport: Viewport;
  canvasSize: { width: number; height: number };
  waveformColors: WaveformColorOption[];
  onSelect: (id: string, additive: boolean) => void;
  onMoveSelection: (id: string, deltaX: number, deltaY: number) => void;
  onUpdate: (id: string, patch: Partial<Omit<TextAnnotation, 'id'>>, saveHistory?: boolean) => void;
  onCommit: () => void;
  onDelete: (id: string) => void;
}

export function AnnotationOverlay({
  annotations, previewAnnotations = [], previewOffset = { x: 0, y: 0 }, selectedAnnotations, mode, canvasRef, viewport, canvasSize, waveformColors,
  onSelect, onMoveSelection, onUpdate, onCommit, onDelete,
}: AnnotationOverlayProps) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [, setDraftText] = React.useState('');
  const [draftRuns, setDraftRuns] = React.useState<AnnotationTextRun[]>([]);
  const [toolbarPosition, setToolbarPosition] = React.useState({ x: 8, y: 8 });
  const editorRef = React.useRef<HTMLDivElement | null>(null);
  const toolbarRef = React.useRef<HTMLDivElement | null>(null);
  const editingAnnotationRef = React.useRef<TextAnnotation | null>(null);
  const editingInitialSnapshotRef = React.useRef('');
  const editingTouchedRef = React.useRef(false);
  const draftTextRef = React.useRef('');
  const draftRunsRef = React.useRef<AnnotationTextRun[]>([]);
  const selectionRangeRef = React.useRef<TextSelectionRange>({ start: 0, end: 0 });
  const [selectionRange, setSelectionRange] = React.useState<TextSelectionRange>({ start: 0, end: 0 });
  const [contextEditor, setContextEditor] = React.useState<{ annotationId: string; x: number; y: number } | null>(null);
  const textMeasureCanvas = React.useMemo(() => document.createElement('canvas'), []);
  const dragRef = React.useRef<{
    pointerId: number;
    annotationId: string;
    offset: Point;
    moved: boolean;
  } | null>(null);

  const interactive = mode === 'select' || mode === 'text' || mode === 'delete';

  const contextAnnotation = contextEditor
    ? annotations.find(annotation => annotation.id === contextEditor.annotationId)
    : undefined;
  const editingAnnotation = editingId ? annotations.find(annotation => annotation.id === editingId) : undefined;

  const updateSelectionRange = React.useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const next = getEditorSelection(editor);
    if (!next) return;
    selectionRangeRef.current = next;
    setSelectionRange(previous => previous.start === next.start && previous.end === next.end ? previous : next);
  }, []);

  React.useEffect(() => {
    if (!editingId) return;
    document.addEventListener('selectionchange', updateSelectionRange);
    return () => document.removeEventListener('selectionchange', updateSelectionRange);
  }, [editingId, updateSelectionRange]);

  React.useLayoutEffect(() => {
    const annotation = editingAnnotationRef.current;
    if (!annotation || !editorRef.current) return;
    editorRef.current.innerHTML = runsToHtml(annotation, draftRunsRef.current.length > 0 ? draftRunsRef.current : [{ text: draftTextRef.current }]);
    editorRef.current.focus();
    const end = draftTextRef.current.length;
    selectionRangeRef.current = { start: end, end };
    setSelectionRange({ start: end, end });
    restoreEditorSelection(editorRef.current, { start: end, end });
  }, [editingId]);

  const serializeEditor = (root: HTMLElement) => {
    const runs: AnnotationTextRun[] = [];
    const append = (text: string, style: AnnotationRunStyle = {}) => {
      if (!text) return;
      runs.push({ text, ...style });
    };
    const visit = (node: Node, inherited: AnnotationRunStyle = {}) => {
      if (node.nodeType === Node.TEXT_NODE) { append(stripEditorCaretMarkers(node.textContent ?? ''), inherited); return; }
      if (node.nodeName === 'BR') { append('\n', inherited); return; }
      const element = node as HTMLElement;
      const next: AnnotationRunStyle = {
        ...inherited,
        ...(element.dataset.color ? { color: element.dataset.color } : {}),
        ...(element.dataset.fontFamily ? { fontFamily: element.dataset.fontFamily as TextAnnotation['fontFamily'] } : {}),
        ...(element.dataset.fontSize ? { fontSize: Number(element.dataset.fontSize) } : {}),
        ...(element.dataset.fontWeight ? { fontWeight: element.dataset.fontWeight as TextAnnotation['fontWeight'] } : {}),
        ...(element.dataset.fontStyle ? { fontStyle: element.dataset.fontStyle as TextAnnotation['fontStyle'] } : {}),
        ...(element.nodeName === 'SUP' ? { verticalAlign: 'super' as const } : element.nodeName === 'SUB' ? { verticalAlign: 'sub' as const } : element.dataset.verticalAlign ? { verticalAlign: element.dataset.verticalAlign as AnnotationTextRun['verticalAlign'] } : {}),
      };
      Array.from(node.childNodes).forEach(child => visit(child, next));
    };
    Array.from(root.childNodes).forEach(child => visit(child));
    const merged = mergeAnnotationRuns(runs);
    return { text: merged.map(run => run.text).join(''), runs: merged };
  };

  const insertEditorLineBreak = (root: HTMLElement) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return false;
    range.deleteContents();
    const lineBreak = document.createElement('br');
    const caretMarker = document.createTextNode(EDITOR_CARET_MARKER);
    const fragment = document.createDocumentFragment();
    fragment.append(lineBreak, caretMarker);
    range.insertNode(fragment);
    range.setStart(caretMarker, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    const value = serializeEditor(root);
    editingTouchedRef.current = true;
    draftTextRef.current = value.text;
    draftRunsRef.current = value.runs;
    setDraftRuns(value.runs);
    setDraftText(value.text);
    updateSelectionRange();
    return true;
  };

  const refreshEditor = React.useCallback((annotation: TextAnnotation, runs: AnnotationTextRun[], range: TextSelectionRange) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.innerHTML = runsToHtml(annotation, runs);
    draftRunsRef.current = runs;
    setDraftRuns(runs);
    draftTextRef.current = runs.map(run => run.text).join('');
    setDraftText(draftTextRef.current);
    editor.focus();
    restoreEditorSelection(editor, range);
    selectionRangeRef.current = range;
    setSelectionRange(range);
  }, []);

  const applyCharacterStyle = React.useCallback((annotation: TextAnnotation, patch: AnnotationRunStyle) => {
    editingTouchedRef.current = true;
    const range = selectionRangeRef.current;
    if (range.start === range.end && !Object.prototype.hasOwnProperty.call(patch, 'verticalAlign')) {
      const keys = ANNOTATION_CHARACTER_STYLE_KEYS.filter(key => Object.prototype.hasOwnProperty.call(patch, key)) as AnnotationCharacterStyleKey[];
      const cleanedRuns = clearAnnotationRunOverrides(draftRunsRef.current, keys) ?? [{ text: draftTextRef.current }];
      refreshEditor(annotation, cleanedRuns, range);
      onUpdate(annotation.id, { ...patch, text: draftTextRef.current, runs: normalizeStoredRuns(cleanedRuns) });
      return;
    }
    const target = range.start === range.end ? { start: 0, end: draftTextRef.current.length } : range;
    const nextRuns = applyAnnotationRunStyle({ ...annotation, text: draftTextRef.current, runs: draftRunsRef.current }, target.start, target.end, patch);
    refreshEditor(annotation, nextRuns, range);
    onUpdate(annotation.id, { text: draftTextRef.current, runs: normalizeStoredRuns(nextRuns) });
  }, [onUpdate, refreshEditor]);

  const clearCharacterStyle = React.useCallback((annotation: TextAnnotation) => {
    editingTouchedRef.current = true;
    const range = selectionRangeRef.current;
    const target = range.start === range.end ? { start: 0, end: draftTextRef.current.length } : range;
    const clearPatch = Object.fromEntries(ANNOTATION_CHARACTER_STYLE_KEYS.map(key => [key, undefined])) as AnnotationRunStyle;
    const nextRuns = applyAnnotationRunStyle({ ...annotation, text: draftTextRef.current, runs: draftRunsRef.current }, target.start, target.end, clearPatch);
    refreshEditor(annotation, nextRuns, range);
    onUpdate(annotation.id, { text: draftTextRef.current, runs: normalizeStoredRuns(nextRuns) });
  }, [onUpdate, refreshEditor]);

  const applyBoxCharacterStyle = React.useCallback((annotation: TextAnnotation, patch: AnnotationRunStyle) => {
    if (Object.prototype.hasOwnProperty.call(patch, 'verticalAlign')) {
      const nextRuns = applyAnnotationRunStyle(annotation, 0, annotation.text.length, patch);
      onUpdate(annotation.id, { runs: normalizeStoredRuns(nextRuns) });
      return;
    }
    onUpdate(annotation.id, patch);
  }, [onUpdate]);

  const clearBoxCharacterStyle = React.useCallback((annotation: TextAnnotation) => {
    onUpdate(annotation.id, { runs: undefined });
  }, [onUpdate]);

  const finishEditing = React.useCallback((annotation: TextAnnotation) => {
    const editor = editorRef.current;
    if (!editor || editingId !== annotation.id) return;
    const value = serializeEditor(editor);
    const text = value.text.replace(/\r/g, '');
    if (text.trim().length === 0) onDelete(annotation.id);
    else {
      const runs = normalizeStoredRuns(value.runs);
      const nextAnnotation = { ...annotation, text, runs };
      onUpdate(annotation.id, { text, runs });
      if (editingTouchedRef.current && annotationContentSnapshot(nextAnnotation) !== editingInitialSnapshotRef.current) onCommit();
    }
    editingAnnotationRef.current = null;
    editingInitialSnapshotRef.current = '';
    editingTouchedRef.current = false;
    setEditingId(null);
  }, [editingId, onCommit, onDelete, onUpdate]);

  React.useEffect(() => {
    const handleCanvasPointerDown = (event: PointerEvent) => {
      if (!editingAnnotation) return;
      const target = event.target;
      if (target instanceof Element && target.closest('[data-annotation-editor="true"], [data-annotation-toolbar="true"]')) return;
      finishEditing(editingAnnotation);
    };
    document.addEventListener('pointerdown', handleCanvasPointerDown, true);
    return () => document.removeEventListener('pointerdown', handleCanvasPointerDown, true);
  }, [editingAnnotation, finishEditing]);

  const renderRuns = (annotation: TextAnnotation) => getAnnotationRuns(annotation).map((run, runIndex) => (
    <React.Fragment key={runIndex}>
      {run.text.split('\n').map((line, lineIndex) => (
        <React.Fragment key={`${runIndex}-${lineIndex}`}>
          {lineIndex > 0 && <br />}
          {line && (() => {
            const style = getEffectiveAnnotationRunStyle(annotation, run);
            return <span style={{ color: style.color, fontFamily: `${style.fontFamily}, sans-serif`, fontSize: `${style.fontSize / annotation.fontSize}em`, fontWeight: style.fontWeight, fontStyle: style.fontStyle, verticalAlign: style.verticalAlign }}>{line}</span>;
          })()}
        </React.Fragment>
      ))}
    </React.Fragment>
  ));

  return (
    <>
    <div className="pointer-events-none absolute inset-0 z-[15] overflow-hidden" aria-label="Text annotations">
      {[
        ...annotations.map(annotation => ({ annotation, preview: false })),
        ...previewAnnotations.map(annotation => ({
          annotation: {
            ...annotation,
            position: {
              x: annotation.position.x + previewOffset.x,
              y: annotation.position.y + previewOffset.y,
            },
          },
          preview: true,
        })),
      ].map(({ annotation, preview }) => {
        const screen = {
          x: canvasSize.width / 2 + (annotation.position.x - viewport.centerX) * viewport.scaleX,
          y: canvasSize.height / 2 - (annotation.position.y - viewport.centerY) * viewport.scaleY,
        };
        const fontPx = Math.max(4, annotation.fontSize * viewport.scaleY);
        const isEditing = editingId === annotation.id;
        const getTextBoxSize = () => {
          const measuredRuns = isEditing ? draftRuns : getAnnotationRuns(annotation);
          const measureContext = textMeasureCanvas.getContext('2d');
          let currentWidth = 0;
          let longestWidth = 0;
          let currentHeight = fontPx;
          const lineHeights: number[] = [];
          measuredRuns.forEach(run => {
            const style = getEffectiveAnnotationRunStyle(annotation, run);
            const runFontPx = Math.max(4, style.fontSize * viewport.scaleY);
            const parts = run.text.split('\n');
            parts.forEach((part, partIndex) => {
              let partWidth = part.length * runFontPx * 0.95;
              if (measureContext) {
                measureContext.font = `${style.fontStyle} ${style.fontWeight} ${runFontPx}px ${style.fontFamily}`;
                partWidth = measureContext.measureText(part).width;
              }
              currentWidth += partWidth;
              currentHeight = Math.max(currentHeight, runFontPx);
              if (partIndex < parts.length - 1) {
                longestWidth = Math.max(longestWidth, currentWidth);
                lineHeights.push(currentHeight);
                currentWidth = 0;
                currentHeight = fontPx;
              }
            });
          });
          longestWidth = Math.max(longestWidth, currentWidth);
          lineHeights.push(currentHeight);
          return {
            width: Math.max(fontPx, longestWidth) + 4,
            height: Math.max(fontPx * 1.2, lineHeights.reduce((height, lineHeight) => height + lineHeight * 1.2, 0)),
          };
        };
        const textBoxSize = getTextBoxSize();
        const textAlign = annotation.textAnchor === 'middle' ? 'center' : annotation.textAnchor === 'end' ? 'right' : 'left';
        const selected = selectedAnnotations.has(annotation.id);
        const formattingRuns = isEditing ? draftRuns : getAnnotationRuns(annotation);
        const superscriptPadding = formattingRuns.some(run => run.verticalAlign === 'super') ? fontPx * 0.35 : 0;
        const subscriptPadding = formattingRuns.some(run => run.verticalAlign === 'sub') ? fontPx * 0.35 : 0;
        const hasTextSelection = selectionRange.end > selectionRange.start;
        const formatValue = hasTextSelection
          ? getFormattingValue(annotation, formattingRuns, selectionRange.start)
          : getBoxFormattingValue(annotation);

        if (preview) {
          return (
            <span
              key={annotation.id}
              className="pointer-events-none absolute inline-block whitespace-pre rounded-sm border border-dashed border-red-500 px-0.5 leading-[1.2]"
              style={{
                left: screen.x,
                top: screen.y - fontPx * 0.8,
                width: textBoxSize.width,
                height: textBoxSize.height,
                boxSizing: 'border-box',
                textAlign,
                color: '#ef4444',
                fontFamily: `${annotation.fontFamily}, sans-serif`,
                fontSize: fontPx,
                fontWeight: annotation.fontWeight,
                fontStyle: annotation.fontStyle,
                opacity: 0.85,
              }}
            >
              {renderRuns(annotation)}
            </span>
          );
        }

        if (isEditing) {
          return (
            <React.Fragment key={annotation.id}>
            <div
              ref={editorRef}
              data-annotation-id={annotation.id}
              data-annotation-editor="true"
              contentEditable
              suppressContentEditableWarning
              className="pointer-events-auto absolute overflow-visible whitespace-pre rounded-sm border-0 bg-transparent px-0.5 leading-[1.2] outline outline-1 outline-offset-2 outline-primary"
              style={{
                left: screen.x,
                top: screen.y - fontPx * 0.8 - superscriptPadding,
                width: 'max-content',
                height: 'auto',
                minWidth: fontPx + 4,
                minHeight: fontPx * 1.2,
                paddingTop: superscriptPadding,
                paddingBottom: subscriptPadding,
                boxSizing: 'border-box',
                textAlign,
                color: annotation.color,
                fontFamily: `${annotation.fontFamily}, sans-serif`,
                fontSize: fontPx,
                fontWeight: annotation.fontWeight,
                fontStyle: annotation.fontStyle,
              }}
              aria-label={annotation.text}
              onInput={(event) => {
                const value = serializeEditor(event.currentTarget);
                if (value.text !== draftTextRef.current || JSON.stringify(value.runs) !== JSON.stringify(draftRunsRef.current)) editingTouchedRef.current = true;
                const selectionAfterInput = getEditorSelection(event.currentTarget);
                draftTextRef.current = value.text;
                draftRunsRef.current = value.runs;
                setDraftRuns(value.runs);
                setDraftText(value.text);
                const inputType = (event.nativeEvent as InputEvent).inputType;
                if (inputType === 'insertLineBreak' && selectionAfterInput) refreshEditor(annotation, value.runs, selectionAfterInput);
                else updateSelectionRange();
              }}
              onBeforeInput={(event) => {
                const inputType = (event.nativeEvent as InputEvent).inputType;
                if (inputType === 'insertLineBreak') {
                  event.preventDefault();
                  insertEditorLineBreak(event.currentTarget);
                } else if (inputType === 'insertParagraph') {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              onBlur={(event) => {
                if (event.relatedTarget instanceof Node && toolbarRef.current?.contains(event.relatedTarget)) return;
                finishEditing(annotation);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
                if (event.key === 'Enter' && event.shiftKey) {
                  event.preventDefault();
                  insertEditorLineBreak(event.currentTarget);
                }
                if (event.key === 'Escape') event.currentTarget.blur();
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setContextEditor({
                  annotationId: annotation.id,
                  x: Math.max(8, Math.min(event.clientX, window.innerWidth - 304)),
                  y: Math.max(8, Math.min(event.clientY, window.innerHeight - 390)),
                });
              }}
            />
            {createPortal(
              <div
                ref={toolbarRef}
                data-annotation-toolbar="true"
                className="ws-surface pointer-events-auto fixed z-[95] max-h-[min(24rem,calc(100vh-1rem))] w-72 overflow-y-auto rounded-xl border border-[var(--ws-border)] bg-white/95 p-3 shadow-xl backdrop-blur-sm"
                style={{
                  left: toolbarPosition.x,
                  top: toolbarPosition.y,
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onContextMenu={(event) => event.preventDefault()}
              >
                <AnnotationCharacterControls
                  target={hasTextSelection ? 'selection' : 'box'}
                  value={formatValue}
                  waveformColors={waveformColors}
                  onApply={(patch) => applyCharacterStyle(annotation, patch)}
                  onClear={() => clearCharacterStyle(annotation)}
                  onCommit={() => undefined}
                />
              </div>,
              document.body,
            )}
            </React.Fragment>
          );
        }

        return (
          <span
            key={annotation.id}
            data-annotation-id={annotation.id}
            className={`absolute inline-block whitespace-pre rounded-sm px-0.5 leading-[1.2] ${interactive ? 'pointer-events-auto' : 'pointer-events-none'} ${selected ? 'outline outline-1 outline-offset-2 outline-primary' : ''}`}
            style={{
              left: screen.x,
              top: screen.y - fontPx * 0.8,
              width: textBoxSize.width,
              height: textBoxSize.height,
              boxSizing: 'border-box',
              textAlign,
              color: annotation.color,
              fontFamily: `${annotation.fontFamily}, sans-serif`,
              fontSize: fontPx,
              fontWeight: annotation.fontWeight,
              fontStyle: annotation.fontStyle,
              cursor: mode === 'delete' ? 'not-allowed' : editingId === annotation.id ? 'text' : 'move',
              userSelect: editingId === annotation.id ? 'text' : 'none',
            }}
            role="textbox"
            aria-label={annotation.text}
            onPointerDown={(event) => {
              event.stopPropagation();
              if (mode === 'delete' && event.button === 0) {
                event.preventDefault();
                onDelete(annotation.id);
                return;
              }
              if (!interactive || event.button !== 0) return;
              event.preventDefault();
              if (!selected || event.shiftKey) onSelect(annotation.id, event.shiftKey);
              const canvas = canvasRef.current;
              if (!canvas) return;
              const rect = canvas.getBoundingClientRect();
              dragRef.current = {
                pointerId: event.pointerId,
                annotationId: annotation.id,
                offset: { x: event.clientX - rect.left - screen.x, y: event.clientY - rect.top - screen.y },
                moved: false,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag || drag.pointerId !== event.pointerId || drag.annotationId !== annotation.id) return;
              const canvas = canvasRef.current;
              if (!canvas) return;
              const rect = canvas.getBoundingClientRect();
              const nextScreen = {
                x: event.clientX - rect.left - drag.offset.x,
                y: event.clientY - rect.top - drag.offset.y,
              };
              const nextPosition = {
                x: viewport.centerX + (nextScreen.x - canvasSize.width / 2) / viewport.scaleX,
                y: viewport.centerY - (nextScreen.y - canvasSize.height / 2) / viewport.scaleY,
              };
              if (Math.hypot(nextPosition.x - annotation.position.x, nextPosition.y - annotation.position.y) > 1e-9) drag.moved = true;
              onMoveSelection(annotation.id, nextPosition.x - annotation.position.x, nextPosition.y - annotation.position.y);
            }}
            onPointerUp={(event) => {
              const drag = dragRef.current;
              if (!drag || drag.pointerId !== event.pointerId || drag.annotationId !== annotation.id) return;
              if (drag.moved) onCommit();
              dragRef.current = null;
            }}
            onDoubleClick={(event) => {
              if (mode !== 'select' && mode !== 'text') return;
              event.preventDefault();
              event.stopPropagation();
              onSelect(annotation.id, false);
              setDraftText(annotation.text);
              draftTextRef.current = annotation.text;
              draftRunsRef.current = getAnnotationRuns(annotation);
              setDraftRuns(draftRunsRef.current);
              editingAnnotationRef.current = annotation;
              editingInitialSnapshotRef.current = annotationContentSnapshot(annotation);
              editingTouchedRef.current = false;
              setToolbarPosition({
                x: Math.max(8, Math.min(event.clientX + 12, window.innerWidth - 296)),
                y: Math.max(8, Math.min(event.clientY + 18, window.innerHeight - 360)),
              });
              setEditingId(annotation.id);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelect(annotation.id, false);
              setContextEditor({
                annotationId: annotation.id,
                x: Math.max(8, Math.min(event.clientX, window.innerWidth - 304)),
                y: Math.max(8, Math.min(event.clientY, window.innerHeight - 390)),
              });
            }}
          >
            {renderRuns(annotation)}
          </span>
        );
      })}
    </div>
    {contextEditor && contextAnnotation && createPortal(
      <div
        className="fixed inset-0 z-[90] pointer-events-auto"
        onPointerDown={() => setContextEditor(null)}
        onContextMenu={(event) => { event.preventDefault(); setContextEditor(null); }}
      >
        <div
          role="dialog"
          aria-label="文字设置"
          className="ws-surface fixed w-72 rounded-xl border border-[var(--ws-border)] bg-white/95 p-3 shadow-xl backdrop-blur-sm"
          style={{ left: contextEditor.x, top: contextEditor.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <AnnotationEditorFields
            annotation={contextAnnotation}
            waveformColors={waveformColors}
            onUpdate={(patch) => onUpdate(contextAnnotation.id, patch)}
            formatTarget="box"
            formatValue={getBoxFormattingValue(contextAnnotation)}
            onApplyCharacterStyle={(patch) => applyBoxCharacterStyle(contextAnnotation, patch)}
            onClearCharacterStyle={() => clearBoxCharacterStyle(contextAnnotation)}
            onCommit={onCommit}
            onDelete={() => {
              setContextEditor(null);
              onDelete(contextAnnotation.id);
            }}
          />
        </div>
      </div>,
      document.body,
    )}
    </>
  );
}
