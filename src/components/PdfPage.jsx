import { memo, useEffect, useRef, useState, useCallback } from "react";
import AnnotationOverlay from "./AnnotationOverlay";
import PdfTextLayer from "./PdfTextLayer";
import {
  TOOLS,
  useAnnotationState,
  useAnnotationActions,
  makeAnnotationId,
} from "../context/AnnotationContext";

const TEXT_TOOLS = new Set([
  TOOLS.HIGHLIGHT,
  TOOLS.UNDERLINE,
  TOOLS.STRIKETHROUGH,
]);

function PageSkeleton({ pageNum }) {
  return (
    <div className="flex h-full w-full animate-pulse flex-col items-center justify-center gap-2 bg-neutral-100">
      <div className="h-4 w-24 rounded bg-neutral-200" />
      <span className="text-sm text-neutral-400">Loading page {pageNum}…</span>
    </div>
  );
}

function PdfPage({ pdfDoc, pageNum, scale, unscaledWidth, unscaledHeight }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isRendered, setIsRendered] = useState(false);

  const { activeTool, color, strokeWidth } = useAnnotationState();
  const { addAnnotation } = useAnnotationActions();

  const width = unscaledWidth * scale;
  const height = unscaledHeight * scale;
  const isTextTool = TEXT_TOOLS.has(activeTool);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { root: null, rootMargin: "1200px 0px", threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || !pdfDoc) return;
    let cancelled = false;
    setIsRendered(false);

    const render = async () => {
      const page = await pdfDoc.getPage(pageNum);
      if (cancelled) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");

      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: scale * dpr });

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / dpr}px`;
      canvas.style.height = `${viewport.height / dpr}px`;

      if (renderTaskRef.current) renderTaskRef.current.cancel();
      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;

      try {
        await task.promise;
        if (!cancelled) setIsRendered(true);
      } catch (err) {
        if (err?.name !== "RenderingCancelledException") console.error(err);
      } finally {
        renderTaskRef.current = null;
      }
    };

    render();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [isVisible, pdfDoc, pageNum, scale]);

  const commitTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const container = containerRef.current;
    const textLayer = container?.querySelector(".textLayer");
    if (!textLayer) return;

    const anchor = range.commonAncestorContainer;
    const anchorEl = anchor.nodeType === Node.TEXT_NODE ? anchor.parentNode : anchor;
    if (!textLayer.contains(anchorEl)) return;

    const containerRect = container.getBoundingClientRect();
    const clientRects = Array.from(range.getClientRects());

    const rects = clientRects
      .filter((r) => r.width > 0.5 && r.height > 0.5)
      .map((r) => ({
        x: ((r.left - containerRect.left) / containerRect.width) * unscaledWidth,
        y: ((r.top - containerRect.top) / containerRect.height) * unscaledHeight,
        w: (r.width / containerRect.width) * unscaledWidth,
        h: (r.height / containerRect.height) * unscaledHeight,
      }));

    if (rects.length === 0) return;

    addAnnotation({
      id: makeAnnotationId(),
      pageNum,
      type: activeTool,
      color,
      strokeWidth,
      rects,
    });

    selection.removeAllRanges();
  }, [activeTool, addAnnotation, color, pageNum, strokeWidth, unscaledHeight, unscaledWidth]);

  const handleTextSelection = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(commitTextSelection);
    });
  }, [commitTextSelection]);

  useEffect(() => {
    if (!isVisible || !isTextTool) return;
    document.addEventListener("mouseup", handleTextSelection);
    return () => document.removeEventListener("mouseup", handleTextSelection);
  }, [isVisible, isTextTool, handleTextSelection]);

  return (
    <div
      ref={containerRef}
      data-page-number={pageNum}
      className="pdf-page relative mx-auto bg-white shadow-lg"
      style={{
        width,
        height,
        "--scale-factor": scale,
      }}
    >
      {isVisible ? (
        <>
          <canvas ref={canvasRef} className="pdf-canvas absolute left-0 top-0 block" style={{ zIndex: 1 }} />
          {!isRendered && (
            <div className="absolute inset-0 z-[1] pointer-events-none">
              <PageSkeleton pageNum={pageNum} />
            </div>
          )}
          <AnnotationOverlay
            pageNum={pageNum}
            unscaledWidth={unscaledWidth}
            unscaledHeight={unscaledHeight}
            width={width}
            height={height}
          />
          <PdfTextLayer
            pdfDoc={pdfDoc}
            pageNum={pageNum}
            scale={scale}
            interactive={isTextTool}
          />
        </>
      ) : (
        <div
          className="flex h-full w-full items-center justify-center bg-neutral-100 text-sm text-neutral-300"
          style={{ minHeight: height }}
        >
          Page {pageNum}
        </div>
      )}
      <div
        className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white"
        style={{ zIndex: 5 }}
      >
        {pageNum}
      </div>
    </div>
  );
}

export default memo(PdfPage);
