import AsyncStorage from "@react-native-async-storage/async-storage";
import { Appearance } from "react-native";

export type AdminThemePreference = "system" | "light" | "dark";

const THEME_KEY = "studymate:admin-theme";

export async function loadAdminTheme(): Promise<AdminThemePreference> {
  try {
    const value = await AsyncStorage.getItem(THEME_KEY);
    if (value === "light" || value === "dark") return value;
  } catch (error) {
    console.warn("Unable to load admin theme preference:", error);
  }
  return "system";
}

export async function saveAdminTheme(theme: AdminThemePreference): Promise<void> {
  try {
    if (theme === "system") await AsyncStorage.removeItem(THEME_KEY);
    else await AsyncStorage.setItem(THEME_KEY, theme);
  } catch (error) {
    console.warn("Unable to save admin theme preference:", error);
  }
  Appearance.setColorScheme(theme === "system" ? "auto" : theme);
}
