import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 18, ...props }: IconProps, children: React.ReactNode) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconPlus = (p: IconProps) => base(p, <><path d="M12 5v14" /><path d="M5 12h14" /></>);

export const IconSidebar = (p: IconProps) =>
  base(p, <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>);

export const IconHamburger = (p: IconProps) =>
  base(p, <><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></>);

export const IconSend = (p: IconProps) =>
  base(p, <><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></>);

export const IconStop = (p: IconProps) =>
  base(p, <rect x="7" y="7" width="10" height="10" rx="1.5" />);

export const IconPaperclip = (p: IconProps) =>
  base(
    p,
    <path d="M21.44 11.05 12.25 20.24a5.5 5.5 0 0 1-7.78-7.78l8.49-8.49a3.5 3.5 0 0 1 4.95 4.95l-8.49 8.49a1.5 1.5 0 0 1-2.12-2.12l7.78-7.78" />
  );

export const IconPencil = (p: IconProps) =>
  base(p, <><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></>);

export const IconTrash = (p: IconProps) =>
  base(p, <><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6" /><path d="M14 11v6" /></>);

export const IconSun = (p: IconProps) =>
  base(p, <><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></>);

export const IconMoon = (p: IconProps) =>
  base(p, <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />);

export const IconLogout = (p: IconProps) =>
  base(p, <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>);

export const IconFile = (p: IconProps) =>
  base(p, <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M8 13h8" /><path d="M8 17h5" /></>);

export const IconDownload = (p: IconProps) =>
  base(p, <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></>);

export const IconClose = (p: IconProps) =>
  base(p, <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>);

export const IconChevron = (p: IconProps) => base(p, <path d="m9 6 6 6-6 6" />);

export const IconLibrary = (p: IconProps) =>
  base(p, <><path d="M16 6H8" /><path d="M16 12H8" /><path d="M13 18H8" /><path d="M17 3v18" /><path d="M21 3v18" /></>);

export const IconSpark = (p: IconProps) =>
  base(p, <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1" />);

export const IconRefresh = (p: IconProps) =>
  base(p, <><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 21v-5h5" /></>);
