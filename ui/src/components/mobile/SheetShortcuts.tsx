"use client";

interface Tab {
  id: string;
  label: string;
}

interface SheetShortcutsProps {
  tabs: Tab[];
  activeTab: string | null;
  isOpen: boolean;
  onOpen: (tabId: string) => void;
}

/**
 * Unified bottom shortcut bar shown when the sheet is closed.
 * Full-width strip with a prominent drag handle visual + 3-col tab grid.
 * Tapping a tab opens the sheet to that tab.
 */
export function SheetShortcuts({ tabs, isOpen, onOpen }: SheetShortcutsProps) {
  return (
    <div
      className={`
        fixed bottom-0 left-0 right-0 z-50 md:hidden
        bg-bg/85 backdrop-blur border-t border-rule
        transition-opacity duration-200
        ${isOpen ? "opacity-0 pointer-events-none" : "opacity-100"}
      `}
    >
      {/* Prominent drag handle visual */}
      <div className="flex justify-center pt-2 pb-1">
        <div className="w-12 h-1.5 bg-dim/70 rounded-full" />
      </div>

      {/* Tab buttons */}
      <div
        className="grid pb-safe"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}
      >
        {tabs.map((t, i) => (
          <button
            key={t.id}
            onClick={() => onOpen(t.id)}
            aria-label={`Open ${t.label} panel`}
            className={`
              py-3 text-[10px] tracking-caps text-dim hover:text-fg
              transition-colors font-mono
              ${i > 0 ? "border-l border-rule" : ""}
            `}
          >
            [{t.label}]
          </button>
        ))}
      </div>
    </div>
  );
}
