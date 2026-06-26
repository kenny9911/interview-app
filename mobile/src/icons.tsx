// Icon set ported 1:1 from the Claude Design source SVGs, drawn with
// react-native-svg so they render identically on iOS and Android.
import React from 'react';
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';

type IconProps = { size?: number; color?: string; strokeWidth?: number };

export const ChevronLeft = ({ size = 18, color = '#1F1A17', strokeWidth = 2.4 }: IconProps) => (
  <Svg width={size * 0.6} height={size} viewBox="0 0 12 20" fill="none">
    <Path d="M10 2L2 10l8 8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const ChevronDown = ({ size = 12, color = '#1F1A17', strokeWidth = 1.8 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 12 12" fill="none">
    <Path d="M3 4.5L6 7.5l3-3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
  </Svg>
);

export const Close = ({ size = 14, color = '#1F1A17', strokeWidth = 2.4 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
  </Svg>
);

export const Eye = ({ size = 19, color = '#8B8576', strokeWidth = 1.8 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" stroke={color} strokeWidth={strokeWidth} />
    <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={strokeWidth} />
  </Svg>
);

export const GoogleG = ({ size = 19 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path fill="#4285F4" d="M22.5 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2-1.9 3.3-4.7 3.3-7.9z" />
    <Path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2v2.8A11 11 0 0 0 12 23z" />
    <Path fill="#FBBC05" d="M5.7 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2a11 11 0 0 0 0 9.8z" />
    <Path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.2 1.6l3.1-3.1A11 11 0 0 0 2 7.1l3.7 2.8C6.6 7.3 9.1 5.4 12 5.4z" />
  </Svg>
);

export const AppleLogo = ({ size = 18, color = '#fff' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.6 2.3 2.8 2.2 1.1 0 1.5-.7 2.9-.7s1.7.7 2.9.7 2-1.1 2.7-2.1c.9-1.2 1.2-2.4 1.3-2.5-.1 0-2.5-1-2.5-3.9zM14.2 5.8c.6-.8 1-1.8.9-2.8-.9 0-2 .6-2.6 1.3-.6.7-1.1 1.7-.9 2.7 1 0 2-.5 2.6-1.2z" />
  </Svg>
);

export const Clock = ({ size = 15, color = '#fff', strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={strokeWidth} />
    <Path d="M12 7v5l3 2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
  </Svg>
);

export const Play = ({ size = 21, color = '#D8401C', strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={strokeWidth} />
    <Path d="M10.5 8.5l5 3.5-5 3.5z" fill={color} />
  </Svg>
);

export const Bulb = ({ size = 21, color = '#6E5AA8', strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.6 1 1.3 1 2.5h6c0-1.2.3-1.9 1-2.5A6 6 0 0 0 12 3z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
  </Svg>
);

export const BarChart = ({ size = 21, color = '#A8742B', strokeWidth = 2.4 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M5 19V11M12 19V5M19 19v-7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
  </Svg>
);

export const GradCap = ({ size = 21, color = '#D8401C', strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M3 9l9-4 9 4-9 4-9-4zM7 11v4c0 1.1 2.2 2.4 5 2.4s5-1.3 5-2.4v-4" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
  </Svg>
);

export const Briefcase = ({ size = 23, color = '#A8742B', strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x={3} y={7} width={18} height={13} rx={2.5} stroke={color} strokeWidth={strokeWidth} />
    <Path d="M8 7V5.5A2.5 2.5 0 0 1 10.5 3h3A2.5 2.5 0 0 1 16 5.5V7" stroke={color} strokeWidth={strokeWidth} />
  </Svg>
);

export const Globe = ({ size = 16, color = '#D8401C', strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={strokeWidth} />
    <Path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" stroke={color} strokeWidth={1.6} />
  </Svg>
);

export const Person = ({ size = 24, color = '#fff', strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={8} r={4} stroke={color} strokeWidth={strokeWidth} />
    <Path d="M5 20a7 7 0 0 1 14 0" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
  </Svg>
);

export const HomeFilled = ({ size = 23, color = '#D8401C' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />
  </Svg>
);

export const Target = ({ size = 23, color = '#aba593', strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={strokeWidth} />
    <Circle cx={12} cy={12} r={3.5} stroke={color} strokeWidth={strokeWidth} />
  </Svg>
);

export const Calendar = ({ size = 23, color = '#aba593', strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x={3} y={5} width={18} height={16} rx={3} stroke={color} strokeWidth={strokeWidth} />
    <Path d="M3 9h18M8 3v4M16 3v4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
  </Svg>
);

export const Check = ({ size = 15, color = '#FF8A5C', strokeWidth = 2.6 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M5 12.5l4.5 4.5L19 7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const ArrowRight = ({ size = 18, color = '#fff', strokeWidth = 2.4 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M5 12h13M13 6l6 6-6 6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const Mic = ({ size = 24, color = '#fff', strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x={9} y={3} width={6} height={11} rx={3} fill={color} />
    <Path d="M6 11a6 6 0 0 0 12 0M12 17v3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
  </Svg>
);

export const Captions = ({ size = 22, color = '#fff', strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x={3} y={5} width={18} height={14} rx={3} stroke={color} strokeWidth={strokeWidth} />
    <Path d="M10 10.5a2.5 2.5 0 1 0 0 3M17 10.5a2.5 2.5 0 1 0 0 3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
  </Svg>
);

export const VideoCam = ({ size = 22, color = '#fff', strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x={3} y={6} width={13} height={12} rx={3} stroke={color} strokeWidth={strokeWidth} />
    <Path d="M16 10l5-3v10l-5-3" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
  </Svg>
);

export const PhoneHangup = ({ size = 22, color = '#fff' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path
      d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24c1.1.37 2.3.57 3.6.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.3.2 2.5.57 3.6a1 1 0 0 1-.24 1l-2.23 2.2z"
      transform="rotate(135 12 12)"
    />
  </Svg>
);

export const CreditCard = ({ size = 26, color = '#1F1A17', strokeWidth = 1.8 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x={2} y={5} width={20} height={14} rx={3} stroke={color} strokeWidth={strokeWidth} />
    <Path d="M2 9h20" stroke={color} strokeWidth={strokeWidth} />
  </Svg>
);

export const Plus = ({ size = 18, color = '#8B8576', strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
  </Svg>
);

export const Lock = ({ size = 13, color = '#a39d8e', strokeWidth = 1.8 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x={5} y={11} width={14} height={9} rx={2} stroke={color} strokeWidth={strokeWidth} />
    <Path d="M8 11V8a4 4 0 0 1 8 0v3" stroke={color} strokeWidth={strokeWidth} />
  </Svg>
);
