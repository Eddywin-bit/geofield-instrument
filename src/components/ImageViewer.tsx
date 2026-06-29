import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

export function ImageViewer({
  images,
  startIndex = 0,
  onClose,
}: {
  images: string[];
  startIndex?: number;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [index, setIndex] = useState(startIndex);

  useEffect(() => {
    setMounted(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setIndex((i) => (i + 1) % Math.max(images.length, 1));
      else if (e.key === "ArrowLeft")
        setIndex((i) => (i - 1 + Math.max(images.length, 1)) % Math.max(images.length, 1));
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, images.length]);

  if (!mounted || typeof document === "undefined" || images.length === 0) return null;

  const safeIndex = ((index % images.length) + images.length) % images.length;
  const hasMany = images.length > 1;
  const stop = (e: React.MouseEvent) => e.stopPropagation();

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
        className="absolute top-4 right-4 h-10 w-10 rounded-full bg-black/60 border border-white/20 text-white flex items-center justify-center active:scale-95 z-10"
      >
        <X className="h-5 w-5" />
      </button>

      {hasMany && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => (i - 1 + images.length) % images.length);
            }}
            aria-label="Previous"
            className="absolute left-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-black/60 border border-white/20 text-white flex items-center justify-center active:scale-95 z-10"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => (i + 1) % images.length);
            }}
            aria-label="Next"
            className="absolute right-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-black/60 border border-white/20 text-white flex items-center justify-center active:scale-95 z-10"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
          <div
            onClick={stop}
            className="absolute bottom-5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/60 border border-white/20 text-white text-xs mono z-10"
          >
            {safeIndex + 1} / {images.length}
          </div>
        </>
      )}

      <img
        src={images[safeIndex]}
        alt="Observation"
        onClick={stop}
        className="max-h-screen max-w-full object-contain select-none"
      />
    </div>,
    document.body,
  );
}
