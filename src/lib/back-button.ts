import { useEffect, useRef } from "react";

/**
 * Registry for Android hardware-back handlers.
 *
 * Any component with an open overlay (bottom sheet, full-screen viewer, modal)
 * registers a handler while it is open. AppLayout runs them most-recent-first
 * on a back press. The first handler that returns true consumes the press, so
 * back closes the overlay instead of navigating away from the screen.
 */
type BackHandler = () => boolean;

const handlers: BackHandler[] = [];

export function pushBackHandler(h: BackHandler): () => void {
  handlers.push(h);
  return () => {
    const i = handlers.indexOf(h);
    if (i !== -1) handlers.splice(i, 1);
  };
}

/** Returns true if a registered handler consumed the back press. */
export function runBackHandlers(): boolean {
  for (let i = handlers.length - 1; i >= 0; i--) {
    if (handlers[i]()) return true;
  }
  return false;
}

/** Registers `onBack` for as long as `active` is true. */
export function useBackHandler(active: boolean, onBack: () => void): void {
  const ref = useRef(onBack);
  ref.current = onBack;
  useEffect(() => {
    if (!active) return;
    return pushBackHandler(() => {
      ref.current();
      return true;
    });
  }, [active]);
}
