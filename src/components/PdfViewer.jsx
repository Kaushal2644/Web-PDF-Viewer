import Toolbar from "./Toolbar";
import { useState, useRef, useEffect, useCallback, memo, useMemo } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min?url";
import PdfPage from "./PdfPage";
import {
  useAnnotationState,
  useAnnotationActions,
  makeAnnotationId,
  makePdfKey,
  TOOLS,
} from "../context/AnnotationContext";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const ZOOM_STEP = 0.15;
const ZOOM_DEBOUNCE_MS = 80;
const PAGE_GAP = 16;
const VIRTUAL_BUFFER = 3;

const TOOL_SHORTCUTS = {
  v: TOOLS.SELECT,
  h: TOOLS.HIGHLIGHT,
  u: TOOLS.UNDERLINE,
  k: TOOLS.STRIKETHROUGH,
  r: TOOLS.RECTANGLE,
  o: TOOLS.OVAL,
  a: TOOLS.ARROW,
  c: TOOLS.CLOUD,
};

function getPageHeight(dim, scale) {
  return dim.height * scale + PAGE_GAP;
}

function computeVisibleRange(scrollTop, clientHeight, pageDims, scale, numPages) {
  const viewTop = scrollTop - 1200;
  const viewBottom = scrollTop + clientHeight + 1200;

  let offset = 0;
  let start = 1;
  let end = numPages;

  for (let i = 0; i < numPages; i++) {
    const h = getPageHeight(pageDims[i], scale);
    if (offset + h >= viewTop && start === 1) start = i + 1;
    offset += h;
    if (offset >= viewBottom) {
      end = i + 1;
      break;
    }
  }

  return {
    start: Math.max(1, start - VIRTUAL_BUFFER),
    end: Math.min(numPages, end + VIRTUAL_BUFFER),
  };
}

function PdfViewerInner() {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pageDims, setPageDims] = useState([]);
  const [scale, setScale] = useState(1);
  const [displayScale, setDisplayScale] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [fileName, setFileName] = useState("");
  const [pageInput, setPageInput] = useState("1");
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [visibleRange, setVisibleRange] = useState({ start: 1, end: 5 });

  const containerRef = useRef(null);
  const scaleTimerRef = useRef(null);
  const rafRef = useRef(null);

  const { annotations, past, future, loadPersisted } = useAnnotationState();
  const {
    setTool,
    deleteAnnotations,
    clearSelection,
    copySelection,
    pasteClipboard,
    undo,
    redo,
    setAnnotations,
    selectedIds,
  } = useAnnotationActions();

  const totalHeight = useMemo(() => {
    if (pageDims.length === 0) return 0;
    return pageDims.reduce((sum, dim) => sum + getPageHeight(dim, scale), 0);
  }, [pageDims, scale]);

  const pageOffsets = useMemo(() => {
    const offsets = [0];
    for (let i = 0; i < pageDims.length; i++) {
      offsets.push(offsets[i] + getPageHeight(pageDims[i], scale));
    }
    return offsets;
  }, [pageDims, scale]);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setLoadProgress(0);
    setFileName(file.name);

    const arrayBuffer = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const dims = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      dims.push({ width: vp.width, height: vp.height });
      setLoadProgress(Math.round((i / doc.numPages) * 100));
    }

    setPdfDoc(doc);
    setNumPages(doc.numPages);
    setPageDims(dims);
    setCurrentPage(1);
    setPageInput("1");
    setVisibleRange({ start: 1, end: Math.min(5, doc.numPages) });

    const containerWidth = (containerRef.current?.clientWidth ?? 800) - 48;
    const initialScale = Math.min(containerWidth / (dims[0]?.width ?? containerWidth), 1.5);
    setScale(initialScale);
    setDisplayScale(initialScale);

    loadPersisted(makePdfKey(file));
    setLoading(false);
    e.target.value = "";
  };

  const applyScale = useCallback((next) => {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, +next.toFixed(2)));
    setDisplayScale(clamped);
    clearTimeout(scaleTimerRef.current);
    scaleTimerRef.current = setTimeout(() => setScale(clamped), ZOOM_DEBOUNCE_MS);
  }, []);

  const zoomIn = useCallback(() => applyScale(displayScale + ZOOM_STEP), [applyScale, displayScale]);
  const zoomOut = useCallback(() => applyScale(displayScale - ZOOM_STEP), [applyScale, displayScale]);

  const fitWidth = useCallback(() => {
    if (!pageDims[0]) return;
    const sidebarOffset = showThumbnails ? 160 : 0;
    const containerWidth = (containerRef.current?.clientWidth ?? 800) - 48 - sidebarOffset;
    applyScale(containerWidth / pageDims[0].width);
  }, [applyScale, pageDims, showThumbnails]);

  const scrollToPage = useCallback((pageNum) => {
    const el = containerRef.current;
    if (!el || pageOffsets.length === 0) return;
    const clamped = Math.max(1, Math.min(numPages, pageNum));
    el.scrollTo({ top: pageOffsets[clamped - 1], behavior: "smooth" });
    setCurrentPage(clamped);
    setPageInput(String(clamped));
  }, [numPages, pageOffsets]);

  const updateScrollState = useCallback(() => {
    const el = containerRef.current;
    if (!el || !pdfDoc || pageDims.length === 0) return;

    const center = el.scrollTop + el.clientHeight * 0.35;
    let page = numPages;
    for (let i = 0; i < numPages; i++) {
      if (center < pageOffsets[i + 1]) {
        page = i + 1;
        break;
      }
    }
    setCurrentPage(page);
    setPageInput(String(page));
    setVisibleRange(computeVisibleRange(el.scrollTop, el.clientHeight, pageDims, scale, numPages));
  }, [pdfDoc, numPages, pageDims, pageOffsets, scale]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else zoomOut();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomIn, zoomOut]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !pdfDoc || pageDims.length === 0) return;

    const onScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updateScrollState);
    };

    updateScrollState();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, [pdfDoc, pageDims, updateScrollState]);

  useEffect(() => {
    updateScrollState();
  }, [scale, updateScrollState]);

  const handlePageInputSubmit = (e) => {
    e.preventDefault();
    const parsed = parseInt(pageInput, 10);
    if (!Number.isNaN(parsed)) scrollToPage(parsed);
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "Z" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        if (selectedIds.length > 0) {
          e.preventDefault();
          copySelection();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        e.preventDefault();
        pasteClipboard(currentPage, makeAnnotationId);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.length > 0) {
          e.preventDefault();
          deleteAnnotations(selectedIds);
        }
        return;
      }
      if (e.key === "Escape") {
        clearSelection();
        return;
      }
      if (e.key === "PageDown" && pdfDoc) {
        e.preventDefault();
        scrollToPage(currentPage + 1);
        return;
      }
      if (e.key === "PageUp" && pdfDoc) {
        e.preventDefault();
        scrollToPage(currentPage - 1);
        return;
      }

      if (!e.ctrlKey && !e.metaKey && TOOL_SHORTCUTS[e.key.toLowerCase()]) {
        setTool(TOOL_SHORTCUTS[e.key.toLowerCase()]);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    clearSelection, copySelection, currentPage, deleteAnnotations, pdfDoc,
    pasteClipboard, redo, scrollToPage, selectedIds, setTool, undo,
  ]);

  useEffect(() => () => clearTimeout(scaleTimerRef.current), []);

  return (
    <div className="flex h-screen flex-col bg-neutral-900 text-neutral-100">
      <header className="flex flex-wrap items-center gap-2 border-b border-neutral-700 bg-neutral-800 px-4 py-2 shadow-md">
        <label
          className="flex cursor-pointer items-center gap-2 rounded-md border border-neutral-600 bg-neutral-700 px-3 py-1.5 text-sm font-medium transition-colors hover:border-blue-500 hover:bg-neutral-600"
          title="Open a PDF file"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
          </svg>
          Open PDF
          <input type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
        </label>

        <div className="mx-1 h-6 w-px bg-neutral-600" />

        <div className="flex items-center gap-1">
          <button
            onClick={zoomOut}
            disabled={!pdfDoc}
            title="Zoom out (Ctrl + scroll)"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-600 bg-neutral-700 text-lg transition-colors hover:bg-blue-600 disabled:opacity-40"
          >
            −
          </button>
          <span className="min-w-[56px] text-center text-sm font-medium tabular-nums">
            {pdfDoc ? `${Math.round(displayScale * 100)}%` : "—"}
          </span>
          <button
            onClick={zoomIn}
            disabled={!pdfDoc}
            title="Zoom in (Ctrl + scroll)"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-600 bg-neutral-700 text-lg transition-colors hover:bg-blue-600 disabled:opacity-40"
          >
            +
          </button>
          <button
            onClick={fitWidth}
            disabled={!pdfDoc}
            title="Fit to width"
            className="rounded-md border border-neutral-600 bg-neutral-700 px-2.5 py-1.5 text-xs transition-colors hover:bg-blue-600 disabled:opacity-40"
          >
            Fit Width
          </button>
        </div>

        <div className="mx-1 h-6 w-px bg-neutral-600" />

        {pdfDoc && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => scrollToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              title="Previous page (Page Up)"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-600 bg-neutral-700 transition-colors hover:bg-blue-600 disabled:opacity-40"
            >
              ‹
            </button>
            <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1 text-sm">
              <input
                type="text"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                className="w-10 rounded border border-neutral-600 bg-neutral-900 px-1.5 py-1 text-center text-sm tabular-nums focus:border-blue-500 focus:outline-none"
                title="Go to page"
              />
              <span className="text-neutral-400">/ {numPages}</span>
            </form>
            <button
              onClick={() => scrollToPage(currentPage + 1)}
              disabled={currentPage >= numPages}
              title="Next page (Page Down)"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-600 bg-neutral-700 transition-colors hover:bg-blue-600 disabled:opacity-40"
            >
              ›
            </button>
          </div>
        )}

        {pdfDoc && (
          <button
            onClick={() => setShowThumbnails((v) => !v)}
            title="Toggle thumbnail sidebar"
            className={`rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
              showThumbnails
                ? "border-blue-500 bg-blue-600"
                : "border-neutral-600 bg-neutral-700 hover:bg-neutral-600"
            }`}
          >
            Thumbnails
          </button>
        )}

        {fileName && (
          <span className="max-w-[180px] truncate text-xs text-neutral-500" title={fileName}>
            {fileName}
          </span>
        )}

        {loading && (
          <span className="ml-auto flex items-center gap-2 text-sm text-neutral-400">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-neutral-500 border-t-blue-500" />
            Loading… {loadProgress}%
          </span>
        )}
      </header>

      <Toolbar
        canUndo={past.length > 0}
        canRedo={future.length > 0}
      />

      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto">
            <polygon points="0 0, 10 4, 0 8" fill="context-stroke" />
          </marker>
        </defs>
      </svg>

      <div className="flex min-h-0 flex-1">
        {showThumbnails && pdfDoc && (
          <aside className="w-40 shrink-0 overflow-y-auto border-r border-neutral-700 bg-neutral-800 p-2">
            {pageDims.map((dim, i) => {
              const pageNum = i + 1;
              const thumbScale = 120 / dim.width;
              return (
                <button
                  key={pageNum}
                  onClick={() => scrollToPage(pageNum)}
                  className={`mb-2 block w-full rounded border p-1 text-left transition-colors ${
                    currentPage === pageNum
                      ? "border-blue-500 bg-neutral-700"
                      : "border-neutral-600 hover:border-neutral-500"
                  }`}
                >
                  <div
                    className="mx-auto bg-white"
                    style={{ width: dim.width * thumbScale, height: dim.height * thumbScale }}
                  >
                    <span className="flex h-full items-center justify-center text-[10px] text-neutral-400">
                      {pageNum}
                    </span>
                  </div>
                  <span className="mt-1 block text-center text-[10px] text-neutral-400">{pageNum}</span>
                </button>
              );
            })}
          </aside>
        )}

        <div ref={containerRef} className="flex-1 overflow-auto bg-neutral-950 p-6">
          {!pdfDoc ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-neutral-500">
              <svg className="h-16 w-16 text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-lg font-medium">Open a PDF to get started</p>
              <p className="max-w-md text-center text-sm text-neutral-600">
                Select text with Highlight, Underline, or Strike tools · Draw shapes with drag · Ctrl+Z to undo · Annotations auto-save
              </p>
            </div>
          ) : (
            <div style={{ height: totalHeight, position: "relative" }}>
              {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => {
                const dim = pageDims[pageNum - 1];
                const top = pageOffsets[pageNum - 1];
                const inRange = pageNum >= visibleRange.start && pageNum <= visibleRange.end;

                return (
                  <div
                    key={pageNum}
                    style={{
                      position: "absolute",
                      top,
                      left: 0,
                      right: 0,
                      height: dim.height * scale,
                    }}
                  >
                    {inRange ? (
                      <PdfPage
                        pdfDoc={pdfDoc}
                        pageNum={pageNum}
                        scale={scale}
                        unscaledWidth={dim.width}
                        unscaledHeight={dim.height}
                      />
                    ) : (
                      <div
                        className="mx-auto bg-neutral-100 shadow-lg"
                        style={{ width: dim.width * scale, height: dim.height * scale }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(PdfViewerInner);
