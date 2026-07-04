import { TOOLS, useAnnotationState, useAnnotationActions } from "../context/AnnotationContext";

const TOOL_GROUPS = [
  {
    label: "Text",
    tools: [
      { id: TOOLS.HIGHLIGHT, label: "Highlight", icon: "▮", shortcut: "H" },
      { id: TOOLS.UNDERLINE, label: "Underline", icon: "U̲", shortcut: "U" },
      { id: TOOLS.STRIKETHROUGH, label: "Strike Through", icon: "S̶", shortcut: "K" },
    ],
  },
  {
    label: "Shapes",
    tools: [
      { id: TOOLS.RECTANGLE, label: "Rectangle", icon: "▭", shortcut: "R" },
      { id: TOOLS.OVAL, label: "Oval", icon: "◯", shortcut: "O" },
      { id: TOOLS.ARROW, label: "Arrow", icon: "↗", shortcut: "A" },
      { id: TOOLS.CLOUD, label: "Cloud", icon: "☁", shortcut: "C" },
    ],
  },
];

const COLORS = ["#ffeb3b", "#4f8cff", "#ff5252", "#4caf50", "#ff9800", "#e040fb"];

export default function Toolbar({ onExport, onImport, canUndo, canRedo }) {
  const { activeTool, color, strokeWidth } = useAnnotationState();
  const { setTool, setColor, setStrokeWidth, undo, redo } = useAnnotationActions();

  const btnClass = (active) =>
    `rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
      active
        ? "border-blue-500 bg-blue-600 text-white shadow-sm"
        : "border-neutral-600 bg-neutral-700 text-neutral-200 hover:border-neutral-500 hover:bg-neutral-600"
    }`;

  const iconBtnClass = (active) =>
    `flex h-8 w-8 items-center justify-center rounded-md border text-sm transition-colors ${
      active
        ? "border-blue-500 bg-blue-600 text-white shadow-sm"
        : "border-neutral-600 bg-neutral-700 text-neutral-200 hover:border-neutral-500 hover:bg-neutral-600"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-neutral-700 bg-neutral-800/80 px-4 py-2 backdrop-blur-sm">
      <button
        onClick={() => setTool(TOOLS.SELECT)}
        title="Select / Move (V)"
        className={btnClass(activeTool === TOOLS.SELECT)}
      >
        <span className="mr-1.5">↖</span>
        Select
      </button>

      <div className="mx-1 h-6 w-px bg-neutral-600" />

      {TOOL_GROUPS.map((group) => (
        <div key={group.label} className="flex items-center gap-1">
          <span className="mr-1 hidden text-[10px] font-semibold uppercase tracking-wider text-neutral-500 sm:inline">
            {group.label}
          </span>
          {group.tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setTool(tool.id)}
              title={`${tool.label} (${tool.shortcut})`}
              aria-label={tool.label}
              className={iconBtnClass(activeTool === tool.id)}
            >
              {tool.icon}
            </button>
          ))}
        </div>
      ))}

      <div className="mx-1 h-6 w-px bg-neutral-600" />

      <div className="flex items-center gap-1.5">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            title={`Color ${c}`}
            aria-label={`Set color ${c}`}
            className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-105 ${
              color === c ? "scale-110 border-white shadow-md" : "border-neutral-600"
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <div className="mx-1 h-6 w-px bg-neutral-600" />

      <div className="flex items-center gap-2">
        <span className="hidden text-[10px] font-semibold uppercase tracking-wider text-neutral-500 sm:inline">
          Stroke
        </span>
        <input
          type="range"
          min="1"
          max="8"
          value={strokeWidth}
          onChange={(e) => setStrokeWidth(Number(e.target.value))}
          className="w-20 accent-blue-500"
          title={`Stroke width: ${strokeWidth}px`}
        />
        <span className="w-4 text-xs tabular-nums text-neutral-400">{strokeWidth}</span>
      </div>

      <div className="mx-1 h-6 w-px bg-neutral-600" />

      <button
        onClick={undo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        className={`${btnClass(false)} disabled:cursor-not-allowed disabled:opacity-40`}
      >
        ↶ Undo
      </button>
      <button
        onClick={redo}
        disabled={!canRedo}
        title="Redo (Ctrl+Shift+Z)"
        className={`${btnClass(false)} disabled:cursor-not-allowed disabled:opacity-40`}
      >
        ↷ Redo
      </button>

      <div className="mx-1 h-6 w-px bg-neutral-600" />

      <span className="ml-auto hidden text-[10px] text-neutral-600 lg:inline">
        Del · Esc · Ctrl+C/V · Ctrl+Z
      </span>
    </div>
  );
}
