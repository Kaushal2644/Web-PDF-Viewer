import { memo, useEffect, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";

const textLayerRegistry = new Map();
let selectionAc = null;

function resetEndOfContent(end, textLayer) {
  textLayer.append(end);
  end.style.width = "";
  end.style.height = "";
  textLayer.classList.remove("selecting");
}

function ensureSelectionListener() {
  if (selectionAc) return;
  selectionAc = new AbortController();
  const { signal } = selectionAc;

  let isPointerDown = false;
  let prevRange = null;

  document.addEventListener("pointerdown", () => {
    isPointerDown = true;
  }, { signal });

  document.addEventListener("pointerup", () => {
    isPointerDown = false;
    textLayerRegistry.forEach(resetEndOfContent);
  }, { signal });

  window.addEventListener("blur", () => {
    isPointerDown = false;
    textLayerRegistry.forEach(resetEndOfContent);
  }, { signal });

  document.addEventListener("keyup", () => {
    if (!isPointerDown) textLayerRegistry.forEach(resetEndOfContent);
  }, { signal });

  document.addEventListener("selectionchange", () => {
    const selection = document.getSelection();
    if (!selection || selection.rangeCount === 0) {
      textLayerRegistry.forEach(resetEndOfContent);
      prevRange = null;
      return;
    }

    const activeLayers = new Set();
    for (let i = 0; i < selection.rangeCount; i++) {
      const range = selection.getRangeAt(i);
      for (const textLayerDiv of textLayerRegistry.keys()) {
        if (!activeLayers.has(textLayerDiv) && range.intersectsNode(textLayerDiv)) {
          activeLayers.add(textLayerDiv);
        }
      }
    }

    for (const [textLayerDiv, endDiv] of textLayerRegistry) {
      if (activeLayers.has(textLayerDiv)) {
        textLayerDiv.classList.add("selecting");
      } else {
        resetEndOfContent(endDiv, textLayerDiv);
      }
    }

    const range = selection.getRangeAt(0);
    const modifyStart =
      prevRange &&
      (range.compareBoundaryPoints(Range.END_TO_END, prevRange) === 0 ||
        range.compareBoundaryPoints(Range.START_TO_END, prevRange) === 0);

    let anchor = modifyStart ? range.startContainer : range.endContainer;
    if (anchor.nodeType === Node.TEXT_NODE) anchor = anchor.parentNode;

    if (!modifyStart && range.endOffset === 0) {
      do {
        while (!anchor.previousSibling) anchor = anchor.parentNode;
        anchor = anchor.previousSibling;
      } while (!anchor.childNodes.length);
    }

    const parentTextLayer = anchor.parentElement?.closest(".textLayer");
    const endDiv = textLayerRegistry.get(parentTextLayer);
    if (endDiv && parentTextLayer) {
      endDiv.style.width = parentTextLayer.style.width;
      endDiv.style.height = parentTextLayer.style.height;
      endDiv.style.userSelect = "text";
      anchor.parentElement.insertBefore(endDiv, modifyStart ? anchor : anchor.nextSibling);
    }
    prevRange = range.cloneRange();
  }, { signal });
}

function registerTextLayer(textLayerDiv, endOfContent) {
  textLayerRegistry.set(textLayerDiv, endOfContent);
  ensureSelectionListener();
}

function unregisterTextLayer(textLayerDiv) {
  textLayerRegistry.delete(textLayerDiv);
  if (textLayerRegistry.size === 0) {
    selectionAc?.abort();
    selectionAc = null;
  }
}

function PdfTextLayer({ pdfDoc, pageNum, scale, interactive }) {
  const containerRef = useRef(null);
  const textLayerRef = useRef(null);
  const scaleRef = useRef(scale);

  scaleRef.current = scale;

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container || !pdfDoc) return undefined;

    const onMouseDown = () => {
      container.classList.add("selecting");
    };

    const render = async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: scaleRef.current });
        container.replaceChildren();

        const textLayer = new pdfjsLib.TextLayer({
          textContentSource: page.streamTextContent({
            includeMarkedContent: true,
            disableNormalization: true,
          }),
          container,
          viewport,
        });

        textLayerRef.current = textLayer;
        await textLayer.render();
        if (cancelled) return;

        const endOfContent = document.createElement("div");
        endOfContent.className = "endOfContent";
        container.append(endOfContent);
        registerTextLayer(container, endOfContent);
        container.addEventListener("mousedown", onMouseDown);
      } catch (err) {
        if (err?.name !== "RenderingCancelledException") {
          console.error(`[TextLayer page ${pageNum}]`, err);
        }
      }
    };

    render();

    return () => {
      cancelled = true;
      container.removeEventListener("mousedown", onMouseDown);
      unregisterTextLayer(container);
      textLayerRef.current?.cancel?.();
      textLayerRef.current = null;
    };
  }, [pdfDoc, pageNum]);

  useEffect(() => {
    if (!textLayerRef.current || !pdfDoc) return;
    let cancelled = false;

    (async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        textLayerRef.current?.update({ viewport });
      } catch (err) {
        if (err?.name !== "RenderingCancelledException") {
          console.error(`[TextLayer scale page ${pageNum}]`, err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNum, scale]);

  return (
    <div
      ref={containerRef}
      className="textLayer"
      tabIndex={interactive ? 0 : -1}
      style={{
        pointerEvents: interactive ? "auto" : "none",
        zIndex: interactive ? 4 : 2,
      }}
    />
  );
}

export default memo(PdfTextLayer);
