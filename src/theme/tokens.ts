/**
 * StudyMate AI design tokens.
 *
 * Single source of truth for the visual language shared by every screen.
 * These values refine the app's existing look (StudyMate green on a soft
 * mint background) — they are not a redesign. Import from here instead of
 * retyping hex codes so spacing, colour, radii, and shadows stay consistent.
 */

// ---- Colour ---------------------------------------------------------------
export const colors = {
  // Brand greens
  primary: "#176B45",
  primaryDark: "#104D33",
  primaryDeep: "#123D2A",
  primaryPressed: "#135A39",
  primarySoft: "#E8F3EB",
  primarySoftAlt: "#E2F2E8",

  // Surfaces
  background: "#F4F8F5",
  surface: "#FFFFFF",
  surfaceAlt: "#F7FBF8",
  surfaceMuted: "#FBFCFB",

  // Lines
  border: "#E5EDE7",
  borderStrong: "#D8E4DB",
  divider: "#EDF2EE",

  // Text
  textPrimary: "#20392B",
  textStrong: "#123D2A",
  textMuted: "#718078",
  textFaint: "#93A19A",

  // Feedback / status
  success: "#16834A",
  successBg: "#E4F6E9",
  successDot: "#20A05A",
  warning: "#B7791F",
  warningBg: "#FFF5D9",
  warningDot: "#E0A418",
  danger: "#C53030",
  dangerBg: "#FDF6F6",
  dangerBorder: "#F3D4D4",
  dangerIconBg: "#B33A3A",
  info: "#267B83",
} as const;

// ---- Spacing scale (px) ---------------------------------------------------
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

// ---- Radii ----------------------------------------------------------------
export const radius = {
  sm: 11,
  md: 14,
  lg: 18,
  xl: 20,
  xxl: 24,
  pill: 999,
} as const;

// ---- Typography -----------------------------------------------------------
export const text = {
  display: { fontSize: 24, fontWeight: "800" as const },
  title: { fontSize: 21, fontWeight: "800" as const },
  heading: { fontSize: 17, fontWeight: "800" as const },
  cardTitle: { fontSize: 15, fontWeight: "800" as const },
  body: { fontSize: 14, fontWeight: "400" as const },
  label: { fontSize: 12, fontWeight: "700" as const },
  caption: { fontSize: 11, fontWeight: "600" as const },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800" as const,
    letterSpacing: 1.6,
  },
} as const;

// ---- Elevation (subtle, cross-platform) -----------------------------------
export const shadow = {
  card: {
    shadowColor: "#0E2C1E",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  raised: {
    shadowColor: "#0E2C1E",
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
} as const;

/**
 * Press feedback shared by every touchable. Applying a slight scale + fade
 * makes cards feel responsive without a heavy animation dependency.
 */
export const press = {
  opacity: 0.9,
  scale: 0.985,
} as const;
