import { useCallback, useEffect, useRef, useState, memo } from "react";
import {
  TOOLS,
  useAnnotationState,
  usePageAnnotations,
  useAnnotationActions,
  makeAnnotationId,
} from "../context/AnnotationContext";

const TEXT_TOOLS = new Set([TOOLS.HIGHLIGHT, TOOLS.UNDERLINE, TOOLS.STRIKETHROUGH]);
const SHAPE_TOOLS = new Set([TOOLS.RECTANGLE, TOOLS.OVAL, TOOLS.ARROW, TOOLS.CLOUD]);
const HANDLE_SIZE = 8;

function clientToUnscaled(svg, clientX, clientY, unscaledWidth, unscaledHeight) {
  const rect = svg.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * unscaledWidth,
    y: ((clientY - rect.top) / rect.height) * unscaledHeight,
  };
}

function getAnnotationBounds(ann) {
  if (ann.rects?.length) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of ann.rects) {
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  if (ann.type === TOOLS.ARROW) {
    const minX = Math.min(ann.x1, ann.x2);
    const minY = Math.min(ann.y1, ann.y2);
    const maxX = Math.max(ann.x1, ann.x2);
    const maxY = Math.max(ann.y1, ann.y2);
    return { x: minX, y: minY, w: maxX - minX || 1, h: maxY - minY || 1 };
  }
  return { x: ann.x, y: ann.y, w: ann.w, h: ann.h };
}

function applyMove(origins, dx, dy) {
  const changesById = {};
  for (const [id, orig] of Object.entries(origins)) {
    if (orig.rects) {
      changesById[id] = { rects: orig.rects.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy })) };
    } else if (orig.type === TOOLS.ARROW) {
      changesById[id] = { x1: orig.x1 + dx, y1: orig.y1 + dy, x2: orig.x2 + dx, y2: orig.y2 + dy };
    } else {
      changesById[id] = { x: orig.x + dx, y: orig.y + dy };
    }
  }
  return changesById;
}

function applyResize(origin, handle, pt) {
  const b = getAnnotationBounds(origin);
  let { x, y, w, h } = b;

  if (handle.includes("e")) w = Math.max(4, pt.x - x);
  if (handle.includes("s")) h = Math.max(4, pt.y - y);
  if (handle.includes("w")) { w = Math.max(4, b.x + b.w - pt.x); x = pt.x; }
  if (handle.includes("n")) { h = Math.max(4, b.y + b.h - pt.y); y = pt.y; }

  if (origin.type === TOOLS.ARROW) {
    return {
      x1: handle.includes("w") ? pt.x : origin.x1,
      y1: handle.includes("n") ? pt.y : origin.y1,
      x2: handle.includes("e") ? pt.x : origin.x2,
      y2: handle.includes("s") ? pt.y : origin.y2,
    };
  }
  return { x, y, w, h };
}

function cloudPath(x, y, w, h) {
  const r = Math.min(w, h) * 0.12;
  const bumps = 6;
  const step = w / bumps;
  let d = `M ${x + r} ${y + h * 0.55}`;
  for (let i = 0; i < bumps; i++) {
    const cx = x + step * i + step / 2;
    d += ` Q ${cx} ${y + h * 0.15} ${x + step * (i + 1)} ${y + h * 0.55}`;
  }
  d += ` L ${x + w - r} ${y + h * 0.7}`;
  d += ` Q ${x + w * 0.75} ${y + h * 0.95} ${x + w * 0.5} ${y + h * 0.75}`;
  d += ` Q ${x + w * 0.25} ${y + h * 0.95} ${x + r} ${y + h * 0.7} Z`;
  return d;
}

function AnnotationOverlay({ pageNum, unscaledWidth, unscaledHeight, width, height }) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const moveHandlerRef = useRef(null);
  const upHandlerRef = useRef(null);

  const { activeTool, color, strokeWidth, selectedIds } = useAnnotationState();
  const pageAnnotations = usePageAnnotations(pageNum);
  const {
    addAnnotation,
    updateAnnotation,
    updateAnnotations,
    selectAnnotation,
    toggleSelection,
    clearSelection,
  } = useAnnotationActions();

  const [preview, setPreview] = useState(null);
  const [dragOverrides, setDragOverrides] = useState(null);

  const isTextTool = TEXT_TOOLS.has(activeTool);
  const isShapeTool = SHAPE_TOOLS.has(activeTool);
  const isSelectTool = activeTool === TOOLS.SELECT;
  const allowInteraction = !isTextTool;

  const displayAnnotations = dragOverrides
    ? pageAnnotations.map((a) => dragOverrides[a.id] ?? a)
    : pageAnnotations;

  const selectedOnPage = displayAnnotations.filter((a) => selectedIds.includes(a.id));

  const endDrag = useCallback(() => {
    window.removeEventListener("mousemove", moveHandlerRef.current);
    window.removeEventListener("mouseup", upHandlerRef.current);
    dragRef.current = null;
    setPreview(null);
    setDragOverrides(null);
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      const drag = dragRef.current;
      const svg = svgRef.current;
      if (!drag || !svg) return;

      const pt = clientToUnscaled(svg, e.clientX, e.clientY, unscaledWidth, unscaledHeight);

      if (drag.mode === "draw") {
        const { startX, startY, tool } = drag;
        if (tool === TOOLS.ARROW) {
          setPreview({ type: TOOLS.ARROW, x1: startX, y1: startY, x2: pt.x, y2: pt.y, color, strokeWidth });
        } else {
          setPreview({
            type: tool,
            x: Math.min(startX, pt.x),
            y: Math.min(startY, pt.y),
            w: Math.abs(pt.x - startX),
            h: Math.abs(pt.y - startY),
            color,
            strokeWidth,
          });
        }
        return;
      }

      if (drag.mode === "move") {
        const dx = pt.x - drag.startPt.x;
        const dy = pt.y - drag.startPt.y;
        const overrides = {};
        for (const [id, orig] of Object.entries(drag.origins)) {
          overrides[id] = { ...orig, ...applyMove({ [id]: orig }, dx, dy)[id] };
        }
        setDragOverrides(overrides);
        return;
      }

      if (drag.mode === "resize") {
        const resized = applyResize(drag.origin, drag.handle, pt);
        setDragOverrides({ [drag.annId]: { ...drag.origin, ...resized } });
      }
    };

    const onUp = (e) => {
      const drag = dragRef.current;
      const svg = svgRef.current;
      if (!drag || !svg) return endDrag();

      if (drag.mode === "draw") {
        const pt = clientToUnscaled(svg, e.clientX, e.clientY, unscaledWidth, unscaledHeight);
        const { startX, startY, tool } = drag;
        const base = { id: makeAnnotationId(), pageNum, color, strokeWidth };

        if (tool === TOOLS.ARROW) {
          if (Math.hypot(pt.x - startX, pt.y - startY) > 4) {
            addAnnotation({ ...base, type: TOOLS.ARROW, x1: startX, y1: startY, x2: pt.x, y2: pt.y });
          }
        } else {
          const x = Math.min(startX, pt.x);
          const y = Math.min(startY, pt.y);
          const w = Math.abs(pt.x - startX);
          const h = Math.abs(pt.y - startY);
          if (w > 4 && h > 4) addAnnotation({ ...base, type: tool, x, y, w, h });
        }
      } else if (drag.mode === "move") {
        const pt = clientToUnscaled(svg, e.clientX, e.clientY, unscaledWidth, unscaledHeight);
        const dx = pt.x - drag.startPt.x;
        const dy = pt.y - drag.startPt.y;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          updateAnnotations(applyMove(drag.origins, dx, dy));
        }
      } else if (drag.mode === "resize") {
        const pt = clientToUnscaled(svg, e.clientX, e.clientY, unscaledWidth, unscaledHeight);
        updateAnnotation(drag.annId, applyResize(drag.origin, drag.handle, pt));
      }

      endDrag();
    };

    moveHandlerRef.current = onMove;
    upHandlerRef.current = onUp;
  }, [
    addAnnotation, color, endDrag, pageNum, strokeWidth,
    unscaledHeight, unscaledWidth, updateAnnotation, updateAnnotations,
  ]);

  const beginDrag = (dragState) => {
    dragRef.current = dragState;
    window.addEventListener("mousemove", moveHandlerRef.current);
    window.addEventListener("mouseup", upHandlerRef.current);
  };

  const startDraw = (e) => {
    if (!isShapeTool || e.button !== 0) return;
    e.preventDefault();
    const pt = clientToUnscaled(svgRef.current, e.clientX, e.clientY, unscaledWidth, unscaledHeight);
    beginDrag({ mode: "draw", startX: pt.x, startY: pt.y, tool: activeTool });
  };

  const startMove = (e, ann) => {
    if (!isSelectTool || e.button !== 0) return;
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      toggleSelection(ann.id);
      return;
    }
    if (!selectedIds.includes(ann.id)) selectAnnotation(ann.id);

    const toMove = selectedIds.includes(ann.id)
      ? pageAnnotations.filter((a) => selectedIds.includes(a.id))
      : [ann];

    const origins = {};
    for (const a of toMove) origins[a.id] = structuredClone(a);

    const pt = clientToUnscaled(svgRef.current, e.clientX, e.clientY, unscaledWidth, unscaledHeight);
    beginDrag({ mode: "move", startPt: pt, origins });
  };

  const startResize = (e, ann, handle) => {
    if (!isSelectTool) return;
    e.stopPropagation();
    beginDrag({ mode: "resize", annId: ann.id, origin: structuredClone(ann), handle });
  };

  useEffect(() => () => endDrag(), [endDrag]);

  const combinedBounds = selectedOnPage.length > 0
    ? selectedOnPage.reduce(
        (acc, ann) => {
          const b = getAnnotationBounds(ann);
          return {
            x: Math.min(acc.x, b.x),
            y: Math.min(acc.y, b.y),
            x2: Math.max(acc.x2, b.x + b.w),
            y2: Math.max(acc.y2, b.y + b.h),
          };
        },
        { x: Infinity, y: Infinity, x2: -Infinity, y2: -Infinity },
      )
    : null;

  const singleResizable = selectedOnPage.length === 1 && !selectedOnPage[0].rects
    ? selectedOnPage[0]
    : null;

  return (
    <svg
      ref={svgRef}
      className="absolute left-0 top-0"
      style={{
        width,
        height,
        zIndex: 3,
        pointerEvents: allowInteraction ? "auto" : "none",
        cursor: isShapeTool ? "crosshair" : "default",
      }}
      viewBox={`0 0 ${unscaledWidth} ${unscaledHeight}`}
      onMouseDown={isShapeTool ? startDraw : undefined}
      onClick={(e) => { if (isSelectTool && e.target === svgRef.current) clearSelection(); }}
    >
      {displayAnnotations.map((ann) => (
        <AnnotationShape
          key={ann.id}
          annotation={ann}
          isSelected={selectedIds.includes(ann.id)}
          allowInteraction={allowInteraction}
          onMouseDown={(ev) => startMove(ev, pageAnnotations.find((a) => a.id === ann.id) ?? ann)}
        />
      ))}

      {preview && <PreviewShape preview={preview} />}

      {isSelectTool && combinedBounds && combinedBounds.x !== Infinity && (
        <SelectionBox
          bounds={{
            x: combinedBounds.x,
            y: combinedBounds.y,
            w: combinedBounds.x2 - combinedBounds.x,
            h: combinedBounds.y2 - combinedBounds.y,
          }}
          onResize={singleResizable
            ? (ev, handle) => startResize(ev, pageAnnotations.find((a) => a.id === singleResizable.id) ?? singleResizable, handle)
            : null}
        />
      )}
    </svg>
  );
}

function PreviewShape({ preview }) {
  const props = { stroke: preview.color, strokeWidth: preview.strokeWidth, fill: "none", opacity: 0.7 };
  switch (preview.type) {
    case TOOLS.RECTANGLE:
      return <rect x={preview.x} y={preview.y} width={preview.w} height={preview.h} {...props} />;
    case TOOLS.OVAL:
      return (
        <ellipse
          cx={preview.x + preview.w / 2} cy={preview.y + preview.h / 2}
          rx={preview.w / 2} ry={preview.h / 2} {...props}
        />
      );
    case TOOLS.ARROW:
      return <line x1={preview.x1} y1={preview.y1} x2={preview.x2} y2={preview.y2} {...props} markerEnd="url(#arrowhead)" />;
    case TOOLS.CLOUD:
      return <path d={cloudPath(preview.x, preview.y, preview.w, preview.h)} {...props} />;
    default:
      return null;
  }
}

function SelectionBox({ bounds, onResize }) {
  const handles = onResize ? ["nw", "n", "ne", "e", "se", "s", "sw", "w"] : [];

  const handlePos = (h) => {
    const { x, y, w, h: bh } = bounds;
    const map = {
      nw: [x, y], n: [x + w / 2, y], ne: [x + w, y],
      e: [x + w, y + bh / 2], se: [x + w, y + bh], s: [x + w / 2, y + bh],
      sw: [x, y + bh], w: [x, y + bh / 2],
    };
    return map[h];
  };

  return (
    <g style={{ pointerEvents: "none" }}>
      <rect
        x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h}
        fill="none" stroke="#4f8cff" strokeWidth={1} strokeDasharray="4 2"
      />
      {handles.map((h) => {
        const [cx, cy] = handlePos(h);
        return (
          <rect
            key={h}
            x={cx - HANDLE_SIZE / 2} y={cy - HANDLE_SIZE / 2}
            width={HANDLE_SIZE} height={HANDLE_SIZE}
            fill="#fff" stroke="#4f8cff" strokeWidth={1}
            style={{ pointerEvents: "auto", cursor: `${h}-resize` }}
            onMouseDown={(ev) => { ev.stopPropagation(); onResize(ev, h); }}
          />
        );
      })}
    </g>
  );
}

function AnnotationShape({ annotation, isSelected, allowInteraction, onMouseDown }) {
  const selectionStyle = isSelected ? { filter: "drop-shadow(0 0 2px rgba(79,140,255,0.9))" } : {};
  const interactionStyle = allowInteraction
    ? { cursor: "move", pointerEvents: "auto" }
    : { pointerEvents: "none" };

  const shapeProps = {
    stroke: annotation.color,
    strokeWidth: annotation.strokeWidth,
    fill: "none",
    style: { ...interactionStyle, ...selectionStyle },
    onMouseDown: allowInteraction ? onMouseDown : undefined,
  };

  switch (annotation.type) {
    case TOOLS.RECTANGLE:
      return <rect x={annotation.x} y={annotation.y} width={annotation.w} height={annotation.h} {...shapeProps} />;

    case TOOLS.OVAL:
      return (
        <ellipse
          cx={annotation.x + annotation.w / 2} cy={annotation.y + annotation.h / 2}
          rx={annotation.w / 2} ry={annotation.h / 2} {...shapeProps}
        />
      );

    case TOOLS.ARROW:
      return (
        <line
          x1={annotation.x1} y1={annotation.y1} x2={annotation.x2} y2={annotation.y2}
          {...shapeProps} markerEnd="url(#arrowhead)"
        />
      );

    case TOOLS.CLOUD:
      return <path d={cloudPath(annotation.x, annotation.y, annotation.w, annotation.h)} {...shapeProps} />;

    case TOOLS.HIGHLIGHT:
      return (
        <g style={{ ...interactionStyle, ...selectionStyle }} onMouseDown={allowInteraction ? onMouseDown : undefined}>
          {annotation.rects.map((r, i) => (
            <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={annotation.color} opacity={0.35} />
          ))}
        </g>
      );

    case TOOLS.UNDERLINE:
      return (
        <g style={{ ...interactionStyle, ...selectionStyle }} onMouseDown={allowInteraction ? onMouseDown : undefined}>
          {annotation.rects.map((r, i) => (
            <line
              key={i} x1={r.x} y1={r.y + r.h} x2={r.x + r.w} y2={r.y + r.h}
              stroke={annotation.color} strokeWidth={annotation.strokeWidth}
            />
          ))}
        </g>
      );

    case TOOLS.STRIKETHROUGH:
      return (
        <g style={{ ...interactionStyle, ...selectionStyle }} onMouseDown={allowInteraction ? onMouseDown : undefined}>
          {annotation.rects.map((r, i) => (
            <line
              key={i} x1={r.x} y1={r.y + r.h / 2} x2={r.x + r.w} y2={r.y + r.h / 2}
              stroke={annotation.color} strokeWidth={annotation.strokeWidth}
            />
          ))}
        </g>
      );

    default:
      return null;
  }
}

export default memo(AnnotationOverlay);
