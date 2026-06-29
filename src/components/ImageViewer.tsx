import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function ImageViewer({ src, onClose }: { src: string; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[1000] bg-black/95 flex items-center justify-center"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close"
        className="absolute top-4 right-4 h-10 w-10 rounded-full bg-black/60 border border-white/20 text-white flex items-center justify-center active:scale-95"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={src}
        alt="Observation"
        className="max-h-screen max-w-full object-contain select-none"
      />
    </div>,
    document.body,
  );
}
