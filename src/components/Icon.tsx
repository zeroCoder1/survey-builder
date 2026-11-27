// Small stroke icon set (24px grid, 1.75 stroke) so every control uses the same visual language.
const PATHS = {
  chevronRight: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  arrowDown: 'M12 5v14M6 13l6 6 6-6',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  x: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  pencil: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  check: 'M5 12l5 5 9-10',
  sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6',
  repeat: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
  expandAll: 'M7 9l5-5 5 5M7 15l5 5 5-5',
  collapseAll: 'M7 4l5 5 5-5M7 20l5-5 5 5',
  users: 'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-1a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  gripHorizontal: 'M6 9h.01M12 9h.01M18 9h.01M6 15h.01M12 15h.01M18 15h.01',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  branch: 'M6 3v12M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
  clipboard: 'M9 3h6v4H9zM15 5h3v16H6V5h3M9 12h6M9 16h4',
  radio: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  checkbox: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8 12l3 3 5-6',
  agree: 'M3 12h18M6 9v6M10.5 9v6M15 9v6M19.5 9v6',
  bars: 'M5 20v-4M10 20v-8M15 20v-12M20 20V4',
  toggle: 'M8 7h8a5 5 0 0 1 0 10H8A5 5 0 0 1 8 7zM16 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  shortText: 'M4 9h16M4 15h10',
  longText: 'M4 6h16M4 10h16M4 14h16M4 18h10',
  hash: 'M5 9h14M5 15h14M10 3L8 21M16 3l-2 18',
} as const;

/** Dot-style icons read better with a heavier stroke. */
const HEAVY: Partial<Record<keyof typeof PATHS, number>> = { grip: 3, gripHorizontal: 3, more: 3 };

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 16, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={`ico ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={HEAVY[name] ?? 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
