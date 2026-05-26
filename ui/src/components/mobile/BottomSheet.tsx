"use client";
import { useEffect, useRef, useState } from "react";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/** Subtle haptic pulse — no-op on desktop / browsers without Vibration API */
function haptic(ms: number = 8) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(ms);
  }
}

const DISMISS_THRESHOLD = 80;   // px downward drag to dismiss
const DISMISS_VELOCITY  = 0.4;  // px/ms downward velocity to dismiss

/**
 * Generic bottom sheet for mobile. Slides up to cover ~60% of the viewport.
 * - Click-outside (on the backdrop) closes it.
 * - The X button top-right closes it.
 * - Dragging the handle bar downward past ~80 px (or fast flick) closes it.
 * - Escape key closes it.
 */
export function BottomSheet({ isOpen, onClose, children }: BottomSheetProps) {
  const [dragY, setDragY] = useState(0);
  const dragging   = useRef(false);
  const startY     = useRef(0);
  const startTime  = useRef(0);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { haptic(); onClose(); }
    };
    if (isOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Reset drag offset whenever sheet opens/closes
  useEffect(() => {
    setDragY(0);
  }, [isOpen]);

  function handlePointerDown(e: React.PointerEvent) {
    dragging.current = true;
    startY.current   = e.clientY;
    startTime.current = performance.now();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    const dy = e.clientY - startY.current;
    setDragY(dy > 0 ? dy : 0); // only positive (downward) movement
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!dragging.current) return;
    dragging.current = false;
    const dy       = e.clientY - startY.current;
    const elapsed  = performance.now() - startTime.current;
    const velocity = elapsed > 0 ? dy / elapsed : 0;

    if (dy > DISMISS_THRESHOLD || velocity > DISMISS_VELOCITY) {
      haptic();
      onClose();
    } else {
      setDragY(0); // spring back
    }
  }

  function handleClose() {
    haptic();
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          onClick={handleClose}
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
        style={{
          height: "60vh",
          // While dragging, override the Tailwind translate with a raw pixel offset
          ...(dragY > 0 ? { transform: `translateY(${dragY}px)` } : {}),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button — bigger tap target */}
        <button
          onClick={handleClose}
          className="absolute top-1 right-2 p-3 text-dim hover:text-fg text-lg leading-none z-10"
          aria-label="Close"
        >
          ✕
        </button>

        {/* Drag handle — interactive surface */}
        <div
          className="flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing select-none"
          style={{ touchAction: "none" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div className="w-12 h-1.5 bg-dim/70 rounded-full" />
        </div>

        {/* Content */}
        <div className="h-[calc(100%-2rem)] overflow-hidden">
          {children}
        </div>
      </div>
    </>
  );
}

export { haptic };
