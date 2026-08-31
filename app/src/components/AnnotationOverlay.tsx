import React from 'react';
import { createPortal } from 'react-dom';
import type { AnnotationTextRun, Point, TextAnnotation, ToolMode, Viewport } from '@/types/waveform';
import { AnnotationEditorFields, type WaveformColorOption } from '@/components/AnnotationControls';
import { getAnnotationRuns } from '@/lib/annotation';

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
  const [draftText, setDraftText] = React.useState('');
  const editorRef = React.useRef<HTMLDivElement | null>(null);
  const draftTextRef = React.useRef('');
  const draftRunsRef = React.useRef<AnnotationTextRun[]>([]);
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

  React.useEffect(() => {
    const handleCanvasPointerDown = (event: PointerEvent) => {
      if (editingId && event.target instanceof HTMLCanvasElement) {
        const active = document.activeElement;
        if (active instanceof HTMLElement && active.dataset.annotationEditor === 'true') active.blur();
        else setEditingId(null);
      }
    };
    document.addEventListener('pointerdown', handleCanvasPointerDown, true);
    return () => document.removeEventListener('pointerdown', handleCanvasPointerDown, true);
  }, [editingId]);

  const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const runsToHtml = React.useCallback((runs: AnnotationTextRun[]) => runs.map(run => {
    const tag = run.verticalAlign === 'super' ? 'sup' : run.verticalAlign === 'sub' ? 'sub' : 'span';
    return `<${tag} style="color:${escapeHtml(run.color ?? '#111827')}">${escapeHtml(run.text).replace(/\n/g, '<br>')}</${tag}>`;
  }).join(''), []);
  React.useLayoutEffect(() => {
    if (!editingId || !editorRef.current) return;
    editorRef.current.innerHTML = runsToHtml(draftRunsRef.current.length > 0 ? draftRunsRef.current : [{ text: draftTextRef.current, color: '#111827', verticalAlign: 'baseline' }]);
    editorRef.current.focus();
  }, [editingId, runsToHtml]);
  const serializeEditor = (root: HTMLElement, fallbackColor: string) => {
    const runs: AnnotationTextRun[] = [];
    const append = (text: string, color: string, verticalAlign: AnnotationTextRun['verticalAlign'] = 'baseline') => {
      if (!text) return;
      const last = runs.at(-1);
      if (last && last.color === color && last.verticalAlign === verticalAlign) last.text += text;
      else runs.push({ text, color, verticalAlign });
    };
    const visit = (node: Node, color = fallbackColor, verticalAlign: AnnotationTextRun['verticalAlign'] = 'baseline') => {
      if (node.nodeType === Node.TEXT_NODE) { append(node.textContent ?? '', color, verticalAlign); return; }
      if (node.nodeName === 'BR') { append('\n', color, verticalAlign); return; }
      const element = node as HTMLElement;
      const nextColor = element.style.color || color;
      const nextAlign = element.nodeName === 'SUP' ? 'super' : element.nodeName === 'SUB' ? 'sub' : verticalAlign;
      Array.from(node.childNodes).forEach(child => visit(child, nextColor, nextAlign));
    };
    Array.from(root.childNodes).forEach(child => visit(child));
    return { text: runs.map(run => run.text).join(''), runs };
  };
  const formatSelection = (command: 'superscript' | 'subscript' | 'removeFormat' | 'foreColor', value?: string) => {
    document.execCommand(command, false, value);
    const editor = document.querySelector<HTMLElement>('[data-annotation-editor="true"]');
    if (editor) editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    editor?.focus();
  };
  const renderRuns = (annotation: TextAnnotation) => getAnnotationRuns(annotation).map((run, runIndex) => (
    <React.Fragment key={runIndex}>
      {run.text.split('\n').map((line, lineIndex) => (
        <React.Fragment key={`${runIndex}-${lineIndex}`}>
          {lineIndex > 0 && <br />}
          {line && <span style={{ color: run.color ?? annotation.color, verticalAlign: run.verticalAlign === 'super' ? 'super' : run.verticalAlign === 'sub' ? 'sub' : 'baseline', fontSize: run.verticalAlign === 'baseline' ? undefined : '0.7em' }}>{line}</span>}
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
        const getTextBoxSize = (text: string) => {
          const lines = text.split('\n');
          const measureContext = textMeasureCanvas.getContext('2d');
          let measuredTextWidth = 0;
          if (measureContext) {
            measureContext.save();
            measureContext.font = `${annotation.fontStyle} ${annotation.fontWeight} ${fontPx}px ${annotation.fontFamily}`;
            measuredTextWidth = lines.reduce((longest, line) => Math.max(longest, measureContext.measureText(line).width), 0);
            measureContext.restore();
          }
          const fallbackTextWidth = lines.reduce((longest, line) => Math.max(longest, line.length * fontPx * 0.95), 0);
          const lineHeight = fontPx * 1.2;
          return {
            width: Math.max(fontPx, measuredTextWidth || fallbackTextWidth) + 4,
            height: Math.max(lineHeight, lines.length * lineHeight),
          };
        };
        const isEditing = editingId === annotation.id;
        const visibleText = isEditing ? draftText : annotation.text;
        const textBoxSize = getTextBoxSize(visibleText);
        const textAlign = annotation.textAnchor === 'middle' ? 'center' : annotation.textAnchor === 'end' ? 'right' : 'left';
        const selected = selectedAnnotations.has(annotation.id);

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
              className="pointer-events-auto absolute overflow-hidden whitespace-pre-wrap rounded-sm border-0 bg-transparent px-0.5 leading-[1.2] outline outline-1 outline-offset-2 outline-primary"
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
              }}
              aria-label={annotation.text}
              onFocus={(event) => {
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(event.currentTarget);
                range.collapse(false);
                selection?.removeAllRanges();
                selection?.addRange(range);
              }}
              onInput={(event) => {
                const value = serializeEditor(event.currentTarget, annotation.color);
                draftTextRef.current = value.text;
                draftRunsRef.current = value.runs;
                setDraftText(value.text);
              }}
              onBlur={(event) => {
                const value = serializeEditor(event.currentTarget, annotation.color);
                const text = value.text.replace(/\r/g, '');
                if (text.trim().length === 0) onDelete(annotation.id);
                else {
                  onUpdate(annotation.id, { text, runs: value.runs });
                  onCommit();
                }
                setEditingId(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.blur();
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
            <div className="pointer-events-auto absolute z-10 flex items-center gap-1 rounded-md border bg-white p-1 shadow-md" style={{ left: screen.x, top: screen.y - fontPx * 0.8 - 36 }} onMouseDown={(event) => event.preventDefault()}>
              <button type="button" className="rounded px-1.5 text-xs font-bold hover:bg-slate-100" onClick={() => formatSelection('superscript')} title="上标">x⁺</button>
              <button type="button" className="rounded px-1.5 text-xs hover:bg-slate-100" onClick={() => formatSelection('subscript')} title="下标">x₋</button>
              <button type="button" className="rounded px-1.5 text-xs hover:bg-slate-100" onClick={() => formatSelection('removeFormat')} title="清除局部格式">清除</button>
              <input type="color" aria-label="局部文字颜色" defaultValue={annotation.color} className="size-5 cursor-pointer" onChange={(event) => formatSelection('foreColor', event.target.value)} />
            </div>
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
