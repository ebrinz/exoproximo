"use client";
import { useEffect } from "react";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Generic bottom sheet for mobile. Slides up to cover ~60% of the viewport.
 * Click-outside (on the backdrop) closes it. The X button in the sheet also closes it.
 * No drag gesture — click-outside + X is enough per spec.
 */
export function BottomSheet({ isOpen, onClose, children }: BottomSheetProps) {
  // Close on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (isOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  return (
    <>
      {/* Backdrop — click-through to canvas, click on backdrop closes sheet */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sheet */}
      <div
        className={`
          fixed bottom-0 left-0 right-0 z-50 md:hidden
          bg-bg/95 backdrop-blur border-t border-rule
          transition-transform duration-200 ease-out
          ${isOpen ? "translate-y-0" : "translate-y-full"}
        `}
        style={{ height: "60vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-3 text-dim hover:text-fg text-lg leading-none z-10"
          aria-label="Close"
        >
          ✕
        </button>

        {/* Drag handle visual */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-dim rounded-full opacity-50" />
        </div>

        {/* Content */}
        <div className="h-[calc(100%-2rem)] overflow-hidden">
          {children}
        </div>
      </div>
    </>
  );
}
