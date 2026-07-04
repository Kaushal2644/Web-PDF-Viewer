import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";

export const TOOLS = {
  SELECT: "select",
  HIGHLIGHT: "highlight",
  UNDERLINE: "underline",
  STRIKETHROUGH: "strikethrough",
  RECTANGLE: "rectangle",
  OVAL: "oval",
  ARROW: "arrow",
  CLOUD: "cloud",
};

const HISTORY_LIMIT = 100;
const STORAGE_PREFIX = "pdf-viewer-annotations:";

const initialState = {
  annotations: [],
  activeTool: TOOLS.SELECT,
  selectedIds: [],
  color: "#ffeb3b",
  strokeWidth: 2,
  past: [],
  future: [],
  clipboard: [],
  pdfKey: null,
};

function snapshot(state) {
  return {
    annotations: state.annotations,
    selectedIds: state.selectedIds,
  };
}

function withHistory(state, nextPartial) {
  const next = { ...state, ...nextPartial, future: [] };
  const snap = snapshot(state);
  const past = [...state.past, snap];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { ...next, past };
}

function reducer(state, action) {
  switch (action.type) {
    case "SET_PDF_KEY":
      return { ...state, pdfKey: action.pdfKey };

    case "SET_TOOL":
      return { ...state, activeTool: action.tool, selectedIds: [] };

    case "SET_COLOR":
      return { ...state, color: action.color };

    case "SET_STROKE_WIDTH":
      return { ...state, strokeWidth: action.width };

    case "ADD_ANNOTATION":
      return withHistory(state, {
        annotations: [...state.annotations, action.annotation],
        selectedIds: [action.annotation.id],
      });

    case "ADD_ANNOTATIONS":
      return withHistory(state, {
        annotations: [...state.annotations, ...action.annotations],
        selectedIds: action.annotations.map((a) => a.id),
      });

    case "UPDATE_ANNOTATION":
      return withHistory(state, {
        annotations: state.annotations.map((a) =>
          a.id === action.id ? { ...a, ...action.changes } : a,
        ),
      });

    case "UPDATE_ANNOTATIONS":
      return withHistory(state, {
        annotations: state.annotations.map((a) => {
          const change = action.changesById[a.id];
          return change ? { ...a, ...change } : a;
        }),
      });

    case "UPDATE_ANNOTATIONS_SILENT":
      return {
        ...state,
        annotations: state.annotations.map((a) => {
          const change = action.changesById[a.id];
          return change ? { ...a, ...change } : a;
        }),
      };

    case "DELETE_ANNOTATIONS": {
      const ids = new Set(action.ids);
      return withHistory(state, {
        annotations: state.annotations.filter((a) => !ids.has(a.id)),
        selectedIds: state.selectedIds.filter((id) => !ids.has(id)),
      });
    }

    case "SELECT_ANNOTATION":
      return { ...state, selectedIds: action.id ? [action.id] : [] };

    case "SELECT_ANNOTATIONS":
      return { ...state, selectedIds: action.ids };

    case "TOGGLE_SELECTION": {
      const ids = new Set(state.selectedIds);
      if (ids.has(action.id)) ids.delete(action.id);
      else ids.add(action.id);
      return { ...state, selectedIds: [...ids] };
    }

    case "CLEAR_SELECTION":
      return { ...state, selectedIds: [] };

    case "SET_ANNOTATIONS":
      return withHistory(state, {
        annotations: action.annotations,
        selectedIds: [],
      });

    case "COPY": {
      const ids = new Set(action.ids ?? state.selectedIds);
      const clipboard = state.annotations.filter((a) => ids.has(a.id));
      return { ...state, clipboard };
    }

    case "PASTE": {
      if (state.clipboard.length === 0) return state;
      const pasted = state.clipboard.map((a) => ({
        ...a,
        id: action.makeId(),
        pageNum: action.pageNum ?? a.pageNum,
        ...(a.x != null ? { x: a.x + 12, y: a.y + 12 } : {}),
        ...(a.x1 != null ? { x1: a.x1 + 12, y1: a.y1 + 12, x2: a.x2 + 12, y2: a.y2 + 12 } : {}),
        ...(a.rects ? { rects: a.rects.map((r) => ({ ...r, x: r.x + 12, y: r.y + 12 })) } : {}),
      }));
      return withHistory(state, {
        annotations: [...state.annotations, ...pasted],
        selectedIds: pasted.map((a) => a.id),
      });
    }

    case "UNDO": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        ...state,
        past: state.past.slice(0, -1),
        future: [snapshot(state), ...state.future],
        annotations: previous.annotations,
        selectedIds: previous.selectedIds,
      };
    }

    case "REDO": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        ...state,
        past: [...state.past, snapshot(state)],
        future: state.future.slice(1),
        annotations: next.annotations,
        selectedIds: next.selectedIds,
      };
    }

    case "LOAD_PERSISTED":
      return {
        ...state,
        annotations: action.annotations ?? [],
        activeTool: action.activeTool ?? state.activeTool,
        color: action.color ?? state.color,
        strokeWidth: action.strokeWidth ?? state.strokeWidth,
        selectedIds: [],
        past: [],
        future: [],
      };

    default:
      return state;
  }
}

const AnnotationStateContext = createContext(null);
const AnnotationDispatchContext = createContext(null);

export function AnnotationProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const skipSaveRef = useRef(false);

  useEffect(() => {
    if (!state.pdfKey || skipSaveRef.current) return;
    const payload = {
      annotations: state.annotations,
      activeTool: state.activeTool,
      color: state.color,
      strokeWidth: state.strokeWidth,
    };
    try {
      localStorage.setItem(STORAGE_PREFIX + state.pdfKey, JSON.stringify(payload));
    } catch {
      /* storage full or unavailable */
    }
  }, [state.annotations, state.activeTool, state.color, state.strokeWidth, state.pdfKey]);

  const loadPersisted = useCallback((pdfKey) => {
    skipSaveRef.current = true;
    dispatch({ type: "SET_PDF_KEY", pdfKey });
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + pdfKey);
      if (raw) {
        const data = JSON.parse(raw);
        dispatch({ type: "LOAD_PERSISTED", ...data });
      } else {
        dispatch({ type: "LOAD_PERSISTED", annotations: [] });
      }
    } catch {
      dispatch({ type: "LOAD_PERSISTED", annotations: [] });
    }
    skipSaveRef.current = false;
  }, []);

  const value = useMemo(() => ({ ...state, loadPersisted }), [state, loadPersisted]);

  return (
    <AnnotationStateContext.Provider value={value}>
      <AnnotationDispatchContext.Provider value={dispatch}>
        {children}
      </AnnotationDispatchContext.Provider>
    </AnnotationStateContext.Provider>
  );
}

export function useAnnotationState() {
  const ctx = useContext(AnnotationStateContext);
  if (!ctx) throw new Error("useAnnotationState must be used within AnnotationProvider");
  return ctx;
}

export function useAnnotationDispatch() {
  const ctx = useContext(AnnotationDispatchContext);
  if (!ctx) throw new Error("useAnnotationDispatch must be used within AnnotationProvider");
  return ctx;
}

export function usePageAnnotations(pageNum) {
  const { annotations } = useAnnotationState();
  return useMemo(
    () => annotations.filter((a) => a.pageNum === pageNum),
    [annotations, pageNum],
  );
}

export function useAnnotationActions() {
  const dispatch = useAnnotationDispatch();

  const addAnnotation = useCallback(
    (annotation) => dispatch({ type: "ADD_ANNOTATION", annotation }),
    [dispatch],
  );
  const addAnnotations = useCallback(
    (annotations) => dispatch({ type: "ADD_ANNOTATIONS", annotations }),
    [dispatch],
  );
  const updateAnnotation = useCallback(
    (id, changes) => dispatch({ type: "UPDATE_ANNOTATION", id, changes }),
    [dispatch],
  );
  const updateAnnotations = useCallback(
    (changesById) => dispatch({ type: "UPDATE_ANNOTATIONS", changesById }),
    [dispatch],
  );
  const updateAnnotationsSilent = useCallback(
    (changesById) => dispatch({ type: "UPDATE_ANNOTATIONS_SILENT", changesById }),
    [dispatch],
  );
  const deleteAnnotations = useCallback(
    (ids) => dispatch({ type: "DELETE_ANNOTATIONS", ids }),
    [dispatch],
  );
  const selectAnnotation = useCallback(
    (id) => dispatch({ type: "SELECT_ANNOTATION", id }),
    [dispatch],
  );
  const selectAnnotations = useCallback(
    (ids) => dispatch({ type: "SELECT_ANNOTATIONS", ids }),
    [dispatch],
  );
  const toggleSelection = useCallback(
    (id) => dispatch({ type: "TOGGLE_SELECTION", id }),
    [dispatch],
  );
  const clearSelection = useCallback(
    () => dispatch({ type: "CLEAR_SELECTION" }),
    [dispatch],
  );
  const setTool = useCallback(
    (tool) => dispatch({ type: "SET_TOOL", tool }),
    [dispatch],
  );
  const setColor = useCallback(
    (color) => dispatch({ type: "SET_COLOR", color }),
    [dispatch],
  );
  const setStrokeWidth = useCallback(
    (width) => dispatch({ type: "SET_STROKE_WIDTH", width }),
    [dispatch],
  );
  const setAnnotations = useCallback(
    (annotations) => dispatch({ type: "SET_ANNOTATIONS", annotations }),
    [dispatch],
  );
  const copySelection = useCallback(
    (ids) => dispatch({ type: "COPY", ids }),
    [dispatch],
  );
  const pasteClipboard = useCallback(
    (pageNum, makeId) => dispatch({ type: "PASTE", pageNum, makeId }),
    [dispatch],
  );
  const undo = useCallback(() => dispatch({ type: "UNDO" }), [dispatch]);
  const redo = useCallback(() => dispatch({ type: "REDO" }), [dispatch]);

  return {
    addAnnotation,
    addAnnotations,
    updateAnnotation,
    updateAnnotations,
    updateAnnotationsSilent,
    deleteAnnotations,
    selectAnnotation,
    selectAnnotations,
    toggleSelection,
    clearSelection,
    setTool,
    setColor,
    setStrokeWidth,
    setAnnotations,
    copySelection,
    pasteClipboard,
    undo,
    redo,
  };
}

let idCounter = 0;
export function makeAnnotationId() {
  idCounter += 1;
  return `ann_${Date.now()}_${idCounter}`;
}

export function makePdfKey(file) {
  return `${file.name}_${file.size}_${file.lastModified}`;
}
