import type { SVGProps } from "react";

export function MapFoldIcon({ strokeWidth = 2, ...props }: SVGProps<SVGSVGElement> & { strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M3 12.5 9 10.5 15 12.5 21 10.5 21 20 15 21.5 9 19.5 3 21Z" />
      <path d="M9 10.5v9" />
      <path d="M15 12.5v9" />
      <path d="M12 2c-2.5 0-4.5 2-4.5 4.5 0 3.1 3.6 6 4.5 6.6.9-.6 4.5-3.5 4.5-6.6C16.5 4 14.5 2 12 2z" />
      <circle cx="12" cy="6.4" r="1.7" />
    </svg>
  );
}
