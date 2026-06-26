// Atelier — design tokens for the viva AI interview app.
// Mirrors the Claude Design source: warm bone paper, plum ink, persimmon hero.

export const colors = {
  bone: '#F4EFE4',
  boneCanvas: '#e7e5df',
  sand: '#E7C8A0',

  plum: '#2E2142',
  plum2: '#3A2952',
  plum3: '#241634',
  plum4: '#221534',
  plumDeep: '#160E24',

  ink: '#1F1A17',
  muted: '#8B8576',
  muted2: '#6c685c',
  faint: '#a39d8e',
  hairline: '#E7E0D0',
  hairline2: '#E0D8C8',
  track: '#E5DCC9',

  persimmon: '#FF5836',
  persimmonD: '#D8401C',
  persimmonL: '#FF8A5C',
  persimmonDeep: '#C0331A',

  // soft tinted chip backgrounds used on cards
  tintCoral: '#FBE3DA',
  tintCoralText: '#D8401C',
  tintViolet: '#ECE6F6',
  tintVioletText: '#6E5AA8',
  tintSand: '#EFE7DA',
  tintSandText: '#A8742B',

  white: '#fff',
  black: '#000',
};

// Custom font families (loaded in App.tsx). In React Native each weight is a
// distinct family name — don't rely on fontWeight with custom fonts.
export const fonts = {
  display: 'BricolageGrotesque_700Bold',
  text: 'HankenGrotesk_400Regular',
  medium: 'HankenGrotesk_500Medium',
  semibold: 'HankenGrotesk_600SemiBold',
  bold: 'HankenGrotesk_700Bold',
  extrabold: 'HankenGrotesk_800ExtraBold',
};

export const radius = {
  sm: 11,
  md: 15,
  lg: 18,
  xl: 22,
  '2xl': 26,
  pill: 999,
};
