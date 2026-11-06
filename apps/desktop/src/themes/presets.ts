/**
 * Built-in desktop themes. Names match the CLI skins / dashboard presets.
 * Add new themes here — no code changes needed elsewhere.
 *
 * The palette-bearing skins (nous, catppuccin, everforest, solarized) are forks
 * of their VS Code originals, converted by `buildThemeFromMarketplace` (see
 * ./install.ts) from the extensions below — the same path a Marketplace import
 * takes, so each is identical to installing the extension by hand and costs the
 * user neither the download nor the install step.
 *
 *   nous       ← github.github-vscode-theme   (Light Default / Dark Default)
 *   catppuccin ← Catppuccin.catppuccin-vsc    (Latte / Mocha)
 *   everforest ← sainnhe.everforest
 *   solarized  ← ryanolsonx.solarized
 *
 * Re-convert marketplace forks from the upstream extension rather than
 * hand-editing hexes; hand edits drift from upstream silently and can't be
 * re-derived. `nous-alt` is first-party — do not re-derive it from GitHub.
 */

import { THEME_PRESET_PALETTES } from '@hermes/shared'

import type { DesktopTheme, DesktopThemeTypography } from './types'

// Color-emoji fonts to append to every stack as a last resort. None of the UI
// text/mono fonts carry emoji glyphs, so without this emoji render as tofu
// boxes on platforms whose default text font lacks them (e.g. Linux/#40364).
// Covers macOS, Windows, Linux, plus the `emoji` generic for anything else.
export const EMOJI_FALLBACK = '"Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", emoji'

const SYSTEM_SANS =
  '"Segoe WPC", "Segoe UI", -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif, ' +
  EMOJI_FALLBACK

// Keep the bundled JetBrains Mono first in every mono fallback chain. Several
// theme display fonts (Courier Prime, IBM Plex Mono) do not cover Vietnamese /
// Latin Extended glyphs; falling directly to platform UI fonts makes code
// blocks visibly non-monospace. JetBrains Mono is bundled with the app and
// covers those glyphs, while the Linux fallbacks catch distros without it.
const SYSTEM_MONO =
  '"JetBrains Mono", "Cascadia Code", "Cascadia Mono", "DejaVu Sans Mono", "Liberation Mono", "Noto Sans Mono", ' +
  '"Noto Mono", "SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace, ' +
  EMOJI_FALLBACK

export const DEFAULT_TYPOGRAPHY: DesktopThemeTypography = { fontSans: SYSTEM_SANS, fontMono: SYSTEM_MONO }

/**
 * Nous — the canonical Hermes desktop identity, forked from the GitHub VS Code
 * theme (github.github-vscode-theme). Light is GitHub Light Default, dark is
 * GitHub Dark Default, both converted through the same path a Marketplace
 * install takes, so the palette here is byte-identical to importing the
 * extension yourself.
 *
 * Typography stays Hermes's own: a VS Code theme carries no font opinion, and
 * these are the stacks every skin has been rendering with.
 */
/**
 * GitHub — the upstream palette, unmodified.
 *
 * `nous` is a fork of this with its own accent, so shipping both keeps the
 * original available on its own terms instead of only existing as the thing
 * nous diverged from. Everything but the accent family is identical between
 * them; separate presets are what let nous's accent move without silently
 * redefining what "GitHub" means.
 */
export const githubTheme: DesktopTheme = {
  name: 'github',
  label: 'GitHub',
  description: 'GitHub Light Default and Dark Default',
  ...THEME_PRESET_PALETTES.github,
  typography: {
    fontSans: SYSTEM_SANS,
    fontMono: SYSTEM_MONO,
    fontUrl: 'https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&display=swap'
  },
  terminal: {
    foreground: '#1f2328',
    black: '#24292f',
    red: '#cf222e',
    green: '#116329',
    yellow: '#4d2d00',
    blue: '#0969da',
    magenta: '#8250df',
    cyan: '#1b7c83',
    white: '#6e7781',
    brightBlack: '#57606a',
    brightRed: '#a40e26',
    brightGreen: '#1a7f37',
    brightYellow: '#633c01',
    brightBlue: '#218bff',
    brightMagenta: '#a475f9',
    brightCyan: '#3192aa',
    brightWhite: '#8c959f'
  },
  darkTerminal: {
    foreground: '#e6edf3',
    black: '#484f58',
    red: '#ff7b72',
    green: '#3fb950',
    yellow: '#d29922',
    blue: '#58a6ff',
    magenta: '#bc8cff',
    cyan: '#39c5cf',
    white: '#b1bac4',
    brightBlack: '#6e7681',
    brightRed: '#ffa198',
    brightGreen: '#56d364',
    brightYellow: '#e3b341',
    brightBlue: '#79c0ff',
    brightMagenta: '#d2a8ff',
    brightCyan: '#56d4dd',
    brightWhite: '#ffffff'
  }
}

/** Catppuccin — Latte in light, Mocha in dark (Catppuccin.catppuccin-vsc). */

/**
 * Nous — the canonical Hermes desktop identity: GitHub's chrome carrying Nous
 * blue. Forked from github.github-vscode-theme (Light Default / Dark Default),
 * with only the accent family re-seeded; every neutral is upstream's.
 *
 * Two seeds, one blue. `#0053FD` is the brand color and reads at 5.4:1 on the
 * light sidebar, but only 3.6:1 on the near-black dark one — so dark carries
 * `#4a84fe`, the same hue (263°) lifted to clear AA at 5.9:1. The soft
 * surfaces below are mixed from those seeds in OKLab, which is what keeps a
 * saturated blue from drifting violet on its way to white.
 */
export const nousTheme: DesktopTheme = {
  name: 'nous',
  label: 'Nous',
  description: 'GitHub chrome, Nous blue accent',
  ...THEME_PRESET_PALETTES.nous,
  typography: {
    fontSans: SYSTEM_SANS,
    fontMono: SYSTEM_MONO,
    fontUrl: 'https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&display=swap'
  },
  terminal: {
    foreground: '#1f2328',
    black: '#24292f',
    red: '#cf222e',
    green: '#116329',
    yellow: '#4d2d00',
    blue: '#0969da',
    magenta: '#8250df',
    cyan: '#1b7c83',
    white: '#6e7781',
    brightBlack: '#57606a',
    brightRed: '#a40e26',
    brightGreen: '#1a7f37',
    brightYellow: '#633c01',
    brightBlue: '#218bff',
    brightMagenta: '#a475f9',
    brightCyan: '#3192aa',
    brightWhite: '#8c959f'
  },
  darkTerminal: {
    foreground: '#e6edf3',
    black: '#484f58',
    red: '#ff7b72',
    green: '#3fb950',
    yellow: '#d29922',
    blue: '#58a6ff',
    magenta: '#bc8cff',
    cyan: '#39c5cf',
    white: '#b1bac4',
    brightBlack: '#6e7681',
    brightRed: '#ffa198',
    brightGreen: '#56d364',
    brightYellow: '#e3b341',
    brightBlue: '#79c0ff',
    brightMagenta: '#d2a8ff',
    brightCyan: '#56d4dd',
    brightWhite: '#ffffff'
  }
}

/** Catppuccin — Latte in light, Mocha in dark (Catppuccin.catppuccin-vsc). */
export const catppuccinTheme: DesktopTheme = {
  name: 'catppuccin',
  label: 'Catppuccin',
  description: 'Soothing pastels — Latte and Mocha',
  ...THEME_PRESET_PALETTES.catppuccin,
  terminal: {
    foreground: '#4c4f69',
    cursor: '#dc8a78',
    selectionBackground: '#acb0be',
    black: '#5c5f77',
    red: '#d20f39',
    green: '#40a02b',
    yellow: '#df8e1d',
    blue: '#1e66f5',
    magenta: '#ea76cb',
    cyan: '#179299',
    white: '#acb0be',
    brightBlack: '#6c6f85',
    brightRed: '#de293e',
    brightGreen: '#49af3d',
    brightYellow: '#eea02d',
    brightBlue: '#456eff',
    brightMagenta: '#fe85d8',
    brightCyan: '#2d9fa8',
    brightWhite: '#bcc0cc'
  },
  darkTerminal: {
    foreground: '#cdd6f4',
    cursor: '#f5e0dc',
    selectionBackground: '#585b70',
    black: '#45475a',
    red: '#f38ba8',
    green: '#a6e3a1',
    yellow: '#f9e2af',
    blue: '#89b4fa',
    magenta: '#f5c2e7',
    cyan: '#94e2d5',
    white: '#a6adc8',
    brightBlack: '#585b70',
    brightRed: '#f37799',
    brightGreen: '#89d88b',
    brightYellow: '#ebd391',
    brightBlue: '#74a8fc',
    brightMagenta: '#f2aede',
    brightCyan: '#6bd7ca',
    brightWhite: '#bac2de'
  }
}

/** Everforest — warm, low-contrast forest greens (sainnhe.everforest). */
export const everforestTheme: DesktopTheme = {
  name: 'everforest',
  label: 'Everforest',
  description: 'Warm, low-contrast forest greens',
  ...THEME_PRESET_PALETTES.everforest,
  terminal: {
    foreground: '#5c6a72',
    cursor: '#5c6a72',
    black: '#5c6a72',
    red: '#f85552',
    green: '#8da101',
    yellow: '#dfa000',
    blue: '#3a94c5',
    magenta: '#df69ba',
    cyan: '#35a77c',
    white: '#939f91',
    brightBlack: '#5c6a72',
    brightRed: '#f85552',
    brightGreen: '#8da101',
    brightYellow: '#dfa000',
    brightBlue: '#3a94c5',
    brightMagenta: '#df69ba',
    brightCyan: '#35a77c',
    brightWhite: '#f4f0d9'
  },
  darkTerminal: {
    foreground: '#d3c6aa',
    cursor: '#d3c6aa',
    black: '#343f44',
    red: '#e67e80',
    green: '#a7c080',
    yellow: '#dbbc7f',
    blue: '#7fbbb3',
    magenta: '#d699b6',
    cyan: '#83c092',
    white: '#d3c6aa',
    brightBlack: '#859289',
    brightRed: '#e67e80',
    brightGreen: '#a7c080',
    brightYellow: '#dbbc7f',
    brightBlue: '#7fbbb3',
    brightMagenta: '#d699b6',
    brightCyan: '#83c092',
    brightWhite: '#d3c6aa'
  }
}

/** Solarized — Ethan Schoonover's fixed-contrast pair (ryanolsonx.solarized). */
export const solarizedTheme: DesktopTheme = {
  name: 'solarized',
  label: 'Solarized',
  description: 'Fixed-contrast light and dark',
  ...THEME_PRESET_PALETTES.solarized,
  terminal: {
    foreground: '#657b83',
    black: '#657b83',
    red: '#dc322f',
    green: '#859900',
    yellow: '#b58900',
    blue: '#268bd2',
    magenta: '#d33682',
    cyan: '#2aa198',
    white: '#eee8d5',
    brightBlack: '#657b83',
    brightRed: '#cb4b16',
    brightGreen: '#859900',
    brightYellow: '#657b83',
    brightBlue: '#839496',
    brightMagenta: '#6c71c4',
    brightCyan: '#93a1a1',
    brightWhite: '#eee8d5'
  },
  darkTerminal: {
    foreground: '#839496',
    cursor: '#ffffff',
    selectionBackground: '#ffffff40',
    black: '#14181d',
    red: '#dc322f',
    green: '#859900',
    yellow: '#b58900',
    blue: '#268bd2',
    magenta: '#d33682',
    cyan: '#2aa198',
    white: '#e5e5e5',
    brightBlack: '#676767',
    brightRed: '#dc322f',
    brightGreen: '#859900',
    brightYellow: '#b58900',
    brightBlue: '#268bd2',
    brightMagenta: '#d33682',
    brightCyan: '#2aa198',
    brightWhite: '#e5e5e5'
  }
}

/**
 * Nous Alt — the hand-authored Nous from before the GitHub fork. Light is
 * glass neutrals with brand blue; dark is cream on mission-blue.
 */
export const nousAltTheme: DesktopTheme = {
  name: 'nous-alt',
  label: 'Nous Alt',
  description: 'Glass neutrals, cream on mission-blue',
  ...THEME_PRESET_PALETTES['nous-alt'],
  typography: {
    fontSans: SYSTEM_SANS,
    fontMono: SYSTEM_MONO,
    fontUrl: 'https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&display=swap'
  }
}

/**
 * Midnight — deep blue-violet, near-monotone. Dark only: it has no light
 * palette because the whole idea is the dark end of the spectrum.
 */
export const midnightTheme: DesktopTheme = {
  name: 'midnight',
  label: 'Midnight',
  description: 'Deep blue-violet with cool accents',
  ...THEME_PRESET_PALETTES.midnight,
  typography: {
    fontMono: `"JetBrains Mono", ${SYSTEM_MONO}`,
    fontUrl: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap'
  }
}

export const emberTheme: DesktopTheme = {
  name: 'ember',
  label: 'Ember',
  description: 'Warm crimson and bronze — forge vibes',
  ...THEME_PRESET_PALETTES.ember,
  typography: {
    fontMono: `"IBM Plex Mono", ${SYSTEM_MONO}`,
    fontUrl: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&display=swap'
  }
}

/** Clean grayscale. Matches the CLI mono skin and dashboard mono theme. */
export const monoTheme: DesktopTheme = {
  name: 'mono',
  label: 'Mono',
  description: 'Clean grayscale — minimal and focused',
  ...THEME_PRESET_PALETTES.mono
}

/** Neon green on black. Matches the CLI cyberpunk skin and dashboard theme. */
export const cyberpunkTheme: DesktopTheme = {
  name: 'cyberpunk',
  label: 'Cyberpunk',
  description: 'Neon green on black — matrix terminal',
  ...THEME_PRESET_PALETTES.cyberpunk,
  typography: {
    fontMono: `"Courier New", Courier, ${SYSTEM_MONO}`,
    fontSans: `"Courier New", Courier, ${SYSTEM_MONO}`
  }
}

/** Cool slate blue for developers. Matches the CLI slate skin. */
export const slateTheme: DesktopTheme = {
  name: 'slate',
  label: 'Slate',
  description: 'Cool slate blue — focused developer theme',
  ...THEME_PRESET_PALETTES.slate,
  typography: {
    fontMono: `"JetBrains Mono", ${SYSTEM_MONO}`
  }
}

export const sakuraTheme: DesktopTheme = {
  name: 'sakura',
  label: '樱花 Sakura',
  description: '粉色少女系主题 — 柔和樱花色调',
  colors: {
    background: '#FDF3F5',
    foreground: '#4A3238',
    card: '#FFFFFF',
    cardForeground: '#4A3238',
    muted: '#F9E4E9',
    mutedForeground: '#9A7B82',
    popover: '#FFFFFF',
    popoverForeground: '#4A3238',
    primary: '#E8798F',
    primaryForeground: '#FFF7F8',
    secondary: '#F6CBD3',
    secondaryForeground: '#5E3F46',
    accent: '#F4A7B9',
    accentForeground: '#533540',
    border: '#F0D4DA',
    input: '#F7E3E7',
    ring: '#E8798F',
    midground: '#E8798F',
    composerRing: '#E8798F',
    destructive: '#C4485F',
    destructiveForeground: '#FFF5F6',
    sidebarBackground: '#FAECEF',
    sidebarBorder: '#F0D4DA',
    userBubble: '#F9DCE2',
    userBubbleBorder: '#EFC6CE'
  },
  darkColors: {
    background: '#2A1E22',
    foreground: '#F3D9DE',
    card: '#37282D',
    cardForeground: '#F3D9DE',
    muted: '#423036',
    mutedForeground: '#C7A2AB',
    popover: '#3C2C31',
    popoverForeground: '#F3D9DE',
    primary: '#F096A9',
    primaryForeground: '#2A1E22',
    secondary: '#4A353B',
    secondaryForeground: '#EBD3D8',
    accent: '#D97A8E',
    accentForeground: '#FBEFF1',
    border: '#564047',
    input: '#241A1E',
    ring: '#F096A9',
    midground: '#F096A9',
    composerRing: '#F096A9',
    destructive: '#C05B6E',
    destructiveForeground: '#FBEDEF',
    sidebarBackground: '#231A1D',
    sidebarBorder: '#4A353B',
    userBubble: '#3F2E33',
    userBubbleBorder: '#5C454B'
  },
  typography: {
    fontSans: SYSTEM_SANS
  },
  layout: {
    vibe: 'chat',
    bubbleStyle: 'pill',
    radiusScalar: 1.3,
    spacingMul: 1.15,
    turnGap: 0.55,
    chatMaxWidth: 42,
    chatLayout: { list: 'feed', userAlign: 'right', userStyle: 'card', assistantStyle: 'card', composer: 'float' }
  }
}

/**
 * Starnight — 星空紫 anime theme. Deep night-violet with luminous accents;
 * the "晚空少女" mood. Wallpaper-ready like sakura.
 */
export const starnightTheme: DesktopTheme = {
  name: 'starnight',
  label: '星夜 Starnight',
  description: '深紫星空主题 — 静谧夜色氛围',
  colors: {
    background: '#171233',
    foreground: '#E4DEFA',
    card: '#221B45',
    cardForeground: '#E4DEFA',
    muted: '#2B2352',
    mutedForeground: '#A79DD6',
    popover: '#251E4B',
    popoverForeground: '#E4DEFA',
    primary: '#9D7BEA',
    primaryForeground: '#171233',
    secondary: '#332A5F',
    secondaryForeground: '#D5CDF2',
    accent: '#7E5FD1',
    accentForeground: '#F0ECFB',
    border: '#3C3168',
    input: '#2A2151',
    ring: '#9D7BEA',
    midground: '#9D7BEA',
    composerRing: '#B79BF0',
    destructive: '#C4586E',
    destructiveForeground: '#FBEFF2',
    sidebarBackground: '#120E28',
    sidebarBorder: '#332A5F',
    userBubble: '#2E2557',
    userBubbleBorder: '#4A3E7E'
  },
  darkColors: {
    background: '#0F0B24',
    foreground: '#DCD5F5',
    card: '#1A1438',
    cardForeground: '#DCD5F5',
    muted: '#221A44',
    mutedForeground: '#9C92C9',
    popover: '#1D1640',
    popoverForeground: '#DCD5F5',
    primary: '#8F6CE0',
    primaryForeground: '#0F0B24',
    secondary: '#292050',
    secondaryForeground: '#CFC7EE',
    accent: '#6E50BE',
    accentForeground: '#ECE7F9',
    border: '#312858',
    input: '#1B1339',
    ring: '#8F6CE0',
    midground: '#8F6CE0',
    composerRing: '#A98CF0',
    destructive: '#B44F65',
    destructiveForeground: '#F9ECEF',
    sidebarBackground: '#0B081C',
    sidebarBorder: '#292050',
    userBubble: '#251D48',
    userBubbleBorder: '#403670'
  },
  typography: {
    fontSans: SYSTEM_SANS
  },
  layout: {
    vibe: 'chat',
    bubbleStyle: 'soft',
    radiusScalar: 1.0,
    spacingMul: 1.05,
    turnGap: 0.45
  }
}

/**
 * Matcha — 抹茶绿 healing theme. Fresh tea greens on cream; the "治愈系"
 * pick. Wallpaper-ready like the other skin-shop themes.
 */
export const matchaTheme: DesktopTheme = {
  name: 'matcha',
  label: '抹茶 Matcha',
  description: '治愈抹茶绿 — 清新自然色调',
  colors: {
    background: '#F4F7EE',
    foreground: '#33402A',
    card: '#FFFFFF',
    cardForeground: '#33402A',
    muted: '#E8F0DC',
    mutedForeground: '#7A8A6C',
    popover: '#FFFFFF',
    popoverForeground: '#33402A',
    primary: '#6B9B4E',
    primaryForeground: '#F8FBF4',
    secondary: '#D9E8C5',
    secondaryForeground: '#41522F',
    accent: '#A3C487',
    accentForeground: '#3A4A2C',
    border: '#DCE8CC',
    input: '#EDF4E2',
    ring: '#6B9B4E',
    midground: '#6B9B4E',
    composerRing: '#6B9B4E',
    destructive: '#B8543F',
    destructiveForeground: '#FBF3EF',
    sidebarBackground: '#EDF3E3',
    sidebarBorder: '#DCE8CC',
    userBubble: '#E2EED2',
    userBubbleBorder: '#D2E3BC'
  },
  darkColors: {
    background: '#1C2318',
    foreground: '#DEE8D2',
    card: '#252E20',
    cardForeground: '#DEE8D2',
    muted: '#2E3A27',
    mutedForeground: '#A5B896',
    popover: '#293323',
    popoverForeground: '#DEE8D2',
    primary: '#87B86A',
    primaryForeground: '#1C2318',
    secondary: '#35422D',
    secondaryForeground: '#D0DEBF',
    accent: '#5F8A46',
    accentForeground: '#EDF4E4',
    border: '#414F37',
    input: '#182011',
    ring: '#87B86A',
    midground: '#87B86A',
    composerRing: '#9BCB80',
    destructive: '#A84E3A',
    destructiveForeground: '#F7EDE9',
    sidebarBackground: '#151C11',
    sidebarBorder: '#35422D',
    userBubble: '#2C3726',
    userBubbleBorder: '#465539'
  },
  typography: {
    fontSans: SYSTEM_SANS
  },
  layout: {
    vibe: 'zen',
    bubbleStyle: 'soft',
    radiusScalar: 0.8,
    spacingMul: 1.2,
    turnGap: 0.7
  }
}

/**
 * Paper — 纸白极简。黑白灰三色,无彩色干扰,默认主题。
 * 亮=纸白底黑字;暗=碳黑底灰白字。黑=文字,白=留白,灰=层级。
 */
/**
 * 青瓷 Celadon — 深青底 + 暖米文字 + 琥珀暖光（dashboard 经典 Teal 皮肤的双端同源移植）。
 * 暗色是本体；亮色为青灰纸感变体。midground=米色承担品牌描边/流式光标。
 */
export const celadonTheme: DesktopTheme = {
  name: 'celadon',
  label: '青瓷 Celadon',
  description: '深青暖米 · 琥珀微光',
  darkColors: {
    background: '#041c1c',
    foreground: '#ffe6cb',
    card: '#0a2626',
    cardForeground: '#ffe6cb',
    muted: '#103030',
    mutedForeground: '#b7a98f',
    popover: '#0c2a2a',
    popoverForeground: '#ffe6cb',
    primary: '#ffe6cb',
    primaryForeground: '#041c1c',
    secondary: '#173a38',
    secondaryForeground: '#e8d5b5',
    accent: '#1b403c',
    accentForeground: '#f5e3c8',
    border: '#1f4744',
    input: '#143532',
    ring: '#ffbd38',
    midground: '#ffe6cb',
    composerRing: '#ffbd38',
    destructive: '#fb2c36',
    destructiveForeground: '#fff5f0',
    sidebarBackground: '#031515',
    sidebarBorder: '#123a37',
    userBubble: '#0f3030',
    userBubbleBorder: '#27504c'
  },
  colors: {
    background: '#eef4ef',
    foreground: '#173430',
    card: '#f7faf6',
    cardForeground: '#173430',
    muted: '#e2ece4',
    mutedForeground: '#5c7268',
    popover: '#ffffff',
    popoverForeground: '#173430',
    primary: '#0f5c50',
    primaryForeground: '#f2faf6',
    secondary: '#cfe3d6',
    secondaryForeground: '#1d453c',
    accent: '#bcd8c8',
    accentForeground: '#14342e',
    border: '#d3e2d8',
    input: '#e6efe8',
    ring: '#b8860b',
    midground: '#0f5c50',
    composerRing: '#b8860b',
    destructive: '#b3271e',
    destructiveForeground: '#fdf3f1',
    sidebarBackground: '#e6efe7',
    sidebarBorder: '#d3e2d8',
    userBubble: '#dcebe0',
    userBubbleBorder: '#c2d8c9'
  },
  typography: {
    fontSans: `"Collapse", ${SYSTEM_SANS}`,
    fontMono: `"Courier Prime", ${SYSTEM_MONO}`,
    fontUrl: '/fonts/rules-display.css'
  },
  layout: {
    vibe: 'chat',
    bubbleStyle: 'sharp',
    radiusScalar: 0.15,
    spacingMul: 1.05,
    baseSize: 0.9,
    chatMaxWidth: 46
  }
}

/**
 * 玫瑰暮色 Rosé Dusk — 暖粉底 + 象牙文字（dashboard Rosé 皮肤移植），衬线气质配 Fraunces。
 */
export const roseDuskTheme: DesktopTheme = {
  name: 'rose-dusk',
  label: '玫瑰暮色 Rosé Dusk',
  description: '柔粉暖象牙 · 夜色温柔',
  darkColors: {
    background: '#1a0f15',
    foreground: '#ffd4e1',
    card: '#25161e',
    cardForeground: '#ffd4e1',
    muted: '#2e1a24',
    mutedForeground: '#b58a9c',
    popover: '#291820',
    popoverForeground: '#ffd4e1',
    primary: '#ffd4e1',
    primaryForeground: '#1a0f15',
    secondary: '#3a2230',
    secondaryForeground: '#f0c3d1',
    accent: '#402436',
    accentForeground: '#f5d3de',
    border: '#462a3c',
    input: '#33202b',
    ring: '#f9a8d4',
    midground: '#ffd4e1',
    composerRing: '#f9a8d4',
    destructive: '#e11d48',
    destructiveForeground: '#fff1f4',
    sidebarBackground: '#150b10',
    sidebarBorder: '#361f2d',
    userBubble: '#2b1822',
    userBubbleBorder: '#4a2c3e'
  },
  colors: {
    background: '#fdf4f7',
    foreground: '#3f2530',
    card: '#ffffff',
    cardForeground: '#3f2530',
    muted: '#f7e6ee',
    mutedForeground: '#9a6f83',
    popover: '#ffffff',
    popoverForeground: '#3f2530',
    primary: '#d16a92',
    primaryForeground: '#fff7fa',
    secondary: '#f3d3e0',
    secondaryForeground: '#54303f',
    accent: '#f0b7ca',
    accentForeground: '#4a2836',
    border: '#eed3de',
    input: '#f8e8ef',
    ring: '#d16a92',
    midground: '#d16a92',
    composerRing: '#d16a92',
    destructive: '#be3455',
    destructiveForeground: '#fff2f5',
    sidebarBackground: '#faecf1',
    sidebarBorder: '#eed3de',
    userBubble: '#f6dde7',
    userBubbleBorder: '#ecc3d2'
  },
  typography: {
    fontSans: `"Fraunces", ${SYSTEM_SANS}`,
    fontMono: `"DM Mono", ${SYSTEM_MONO}`,
    fontUrl:
      'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=DM+Mono:wght@400;500&display=swap'
  }
}

/**
 * 珊瑚螃蟹 Coral Crab — 螃蟹OPC 自有品牌皮肤（design-preview/layout-preview.html 定稿）。
 * 奶油白底 + 珊瑚橙品牌色 + 暖褐暗色；大圆角软糯风，与上游 Teal 彻底切割。
 * 暗色=暖褐黑（参考 Claude 暖暗色）；midground=珊瑚承担品牌描边/流式光标。
 */
export const coralTheme: DesktopTheme = {
  name: 'coral',
  label: '珊瑚螃蟹 Coral Crab',
  description: '奶油白 · 珊瑚橙 · 暖褐夜',
  darkColors: {
    background: '#1c1512',
    foreground: '#f2e7dd',
    card: '#2a201c',
    cardForeground: '#f2e7dd',
    muted: '#241b17',
    mutedForeground: '#b3a294',
    popover: '#2a201c',
    popoverForeground: '#f2e7dd',
    primary: '#ff8266',
    primaryForeground: '#1c1512',
    secondary: '#3a2c26',
    secondaryForeground: '#e8d9cb',
    accent: '#453329',
    accentForeground: '#f0e0d0',
    border: '#453329',
    input: '#33261f',
    ring: '#ff8266',
    midground: '#ff8266',
    composerRing: '#ff8266',
    destructive: '#fb2c36',
    destructiveForeground: '#fff5f0',
    sidebarBackground: '#171110',
    sidebarBorder: '#3a2c26',
    userBubble: '#33261f',
    userBubbleBorder: '#56423a'
  },
  colors: {
    background: '#fbf6f0',
    foreground: '#2d2420',
    card: '#ffffff',
    cardForeground: '#2d2420',
    muted: '#f4ece3',
    mutedForeground: '#6b5d54',
    popover: '#ffffff',
    popoverForeground: '#2d2420',
    primary: '#ff6b4a',
    primaryForeground: '#fff8f5',
    secondary: '#ffe9e2',
    secondaryForeground: '#8a3d28',
    accent: '#ffd9cd',
    accentForeground: '#7a3520',
    border: '#ece2d8',
    input: '#f4ece3',
    ring: '#ff6b4a',
    midground: '#ff6b4a',
    composerRing: '#ff6b4a',
    destructive: '#d63a24',
    destructiveForeground: '#fff5f0',
    sidebarBackground: '#f6efe7',
    sidebarBorder: '#ece2d8',
    userBubble: '#ffe9e2',
    userBubbleBorder: '#ffd0c2'
  },
  typography: {
    fontSans: `"MiSans", "HarmonyOS Sans SC", ${SYSTEM_SANS}`,
    fontMono: `"MiSans Mono", ${SYSTEM_MONO}`
  },
  layout: {
    vibe: 'chat',
    bubbleStyle: 'pill',
    radiusScalar: 1.1,
    spacingMul: 1.08,
    baseSize: 0.95,
    chatMaxWidth: 44
  }
}

export const paperTheme: DesktopTheme = {
  name: 'paper',
  label: '纸白 Paper',
  description: '黑白极简 · 纸墨无声',
  colors: {
    background: '#FAFAF8',
    foreground: '#1A1A1A',
    card: '#FFFFFF',
    cardForeground: '#1A1A1A',
    muted: '#F0F0EE',
    mutedForeground: '#8A8A86',
    popover: '#FFFFFF',
    popoverForeground: '#1A1A1A',
    primary: '#1A1A1A',
    primaryForeground: '#FAFAF8',
    secondary: '#EAEAE8',
    secondaryForeground: '#2A2A2A',
    accent: '#D4D4D0',
    accentForeground: '#1A1A1A',
    border: '#E4E4E0',
    input: '#F5F5F3',
    ring: '#1A1A1A',
    midground: '#1A1A1A',
    composerRing: '#1A1A1A',
    destructive: '#B91C1C',
    destructiveForeground: '#FFFFFF',
    sidebarBackground: '#F4F4F2',
    sidebarBorder: '#E4E4E0',
    userBubble: '#1A1A1A',
    userBubbleBorder: '#1A1A1A'
  },
  darkColors: {
    background: '#111111',
    foreground: '#E8E8E6',
    card: '#191919',
    cardForeground: '#E8E8E6',
    muted: '#222222',
    mutedForeground: '#9A9A96',
    popover: '#1C1C1C',
    popoverForeground: '#E8E8E6',
    primary: '#E8E8E6',
    primaryForeground: '#111111',
    secondary: '#262626',
    secondaryForeground: '#D4D4D0',
    accent: '#3A3A3A',
    accentForeground: '#E8E8E6',
    border: '#2E2E2E',
    input: '#0D0D0D',
    ring: '#E8E8E6',
    midground: '#E8E8E6',
    composerRing: '#E8E8E6',
    destructive: '#A81818',
    destructiveForeground: '#F5E8E8',
    sidebarBackground: '#0C0C0C',
    sidebarBorder: '#262626',
    userBubble: '#242424',
    userBubbleBorder: '#383838'
  },
  typography: {
    fontSans: SYSTEM_SANS
  },
  layout: {
    vibe: 'zen',
    bubbleStyle: 'soft',
    radiusScalar: 0.5,
    spacingMul: 1.05,
    turnGap: 0.5
  }
}

export const BUILTIN_THEMES: Record<string, DesktopTheme> = {
  paper: paperTheme,
  coral: coralTheme,
  celadon: celadonTheme,
  'rose-dusk': roseDuskTheme,
  nous: nousTheme,
  github: githubTheme,
  catppuccin: catppuccinTheme,
  everforest: everforestTheme,
  solarized: solarizedTheme,
  'nous-alt': nousAltTheme,
  midnight: midnightTheme,
  ember: emberTheme,
  mono: monoTheme,
  slate: slateTheme,
  cyberpunk: cyberpunkTheme,
  sakura: sakuraTheme,
  starnight: starnightTheme,
  matcha: matchaTheme
}

export const BUILTIN_THEME_LIST = Object.values(BUILTIN_THEMES)

/** Skin used when nothing is persisted or the persisted name is retired. */
export const DEFAULT_SKIN_NAME = 'paper'
