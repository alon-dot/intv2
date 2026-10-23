import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };
function Icon({ children, size = 24, ...props }: IconProps) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>; }
export function ClipboardList(props: IconProps) { return <Icon {...props}><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6M9 10h6M9 14h6M9 18h3"/><path d="M9 2h6v4H9z"/></Icon>; }
export function Clock3(props: IconProps) { return <Icon {...props}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Icon>; }
export function BriefcaseBusiness(props: IconProps) { return <Icon {...props}><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/></Icon>; }
export function History(props: IconProps) { return <Icon {...props}><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></Icon>; }
export function Users(props: IconProps) { return <Icon {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></Icon>; }
export function ChartNoAxesCombined(props: IconProps) { return <Icon {...props}><path d="M3 3v18h18M7 14l4-4 4 3 6-7"/><path d="M17 6h4v4"/></Icon>; }
export function Activity(props: IconProps) { return <Icon {...props}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></Icon>; }
export function Menu(props: IconProps) { return <Icon {...props}><path d="M4 6h16M4 12h16M4 18h16"/></Icon>; }
export function X(props: IconProps) { return <Icon {...props}><path d="m18 6-12 12M6 6l12 12"/></Icon>; }
