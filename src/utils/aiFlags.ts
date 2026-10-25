// Build-time switch for AI entry points. Server-side app_settings remains the
// source of truth; this flag lets a build hide AI UI entirely.
export const AI_ENABLED = process.env.EXPO_PUBLIC_AI_ENABLED !== "false";
