import AsyncStorage from "@react-native-async-storage/async-storage";
import { Appearance } from "react-native";

export type AppearancePreference = "system" | "light" | "dark";

function storageKey(userId: string) {
  return `studymate:appearance:${userId}`;
}

export async function loadAccountAppearance(userId: string): Promise<AppearancePreference> {
  try {
    const value = await AsyncStorage.getItem(storageKey(userId));
    if (value === "light" || value === "dark") return value;
  } catch (error) {
    console.warn("Unable to load appearance preference:", error);
  }
  return "system";
}

export async function saveAccountAppearance(userId: string, preference: AppearancePreference): Promise<void> {
  try {
    if (preference === "system") await AsyncStorage.removeItem(storageKey(userId));
    else await AsyncStorage.setItem(storageKey(userId), preference);
  } catch (error) {
    console.warn("Unable to save appearance preference:", error);
  }
  Appearance.setColorScheme(preference === "system" ? "auto" : preference);
}

export function applyAppearance(preference: AppearancePreference) {
  Appearance.setColorScheme(preference === "system" ? "auto" : preference);
}
