import type { AppearancePreference } from "@/utils/accountAppearance";
import { colors, radius, spacing } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";

const OPTIONS: { value: AppearancePreference; title: string; icon: "phone-portrait-outline" | "sunny-outline" | "moon-outline" }[] = [
  { value: "system", title: "System", icon: "phone-portrait-outline" },
  { value: "light", title: "Light", icon: "sunny-outline" },
  { value: "dark", title: "Dark", icon: "moon-outline" },
];

export function AppearancePreferenceSelector({ value, onChange }: { value: AppearancePreference; onChange: (value: AppearancePreference) => void }) {
  const dark = useColorScheme() === "dark";
  return <View style={[styles.card, dark && styles.cardDark]}>
    <View style={styles.heading}><View style={[styles.iconWrap, dark && styles.iconWrapDark]}><Ionicons name="contrast-outline" size={18} color={dark ? "#B9E4C7" : colors.primary} /></View><View style={styles.headingCopy}><Text style={[styles.title, dark && styles.titleDark]}>Appearance</Text><Text style={[styles.subtitle, dark && styles.subtitleDark]}>Choose how StudyMate looks on this device.</Text></View></View>
    <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel="Appearance preference">
      {OPTIONS.map((option) => {
        const selected = value === option.value;
        return <Pressable key={option.value} onPress={() => onChange(option.value)} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`${option.title} theme`} style={[styles.option, dark && styles.optionDark, selected && (dark ? styles.optionSelectedDark : styles.optionSelected)]}>
          <Ionicons name={option.icon} size={16} color={selected ? (dark ? "#B9E4C7" : colors.primary) : (dark ? "#AAB8AE" : colors.textMuted)} />
          <Text style={[styles.optionText, dark && styles.optionTextDark, selected && (dark ? styles.optionTextSelectedDark : styles.optionTextSelected)]}>{option.title}</Text>
          {selected ? <Ionicons name="checkmark-circle" size={15} color={dark ? "#B9E4C7" : colors.primary} /> : null}
        </Pressable>;
      })}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, gap: spacing.md },
  cardDark: { backgroundColor: "#19241C", borderColor: "#2C3A30" },
  heading: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconWrap: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  iconWrapDark: { backgroundColor: "#24372A" },
  headingCopy: { flex: 1, gap: 3 }, title: { color: colors.textStrong, fontSize: 13, fontWeight: "800" }, titleDark: { color: "#EEF4EF" },
  subtitle: { color: colors.textMuted, fontSize: 10, lineHeight: 15 }, subtitleDark: { color: "#AAB8AE" },
  options: { flexDirection: "row", gap: 7 },
  option: { flex: 1, minHeight: 39, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 5, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: "#FBFCFB" },
  optionDark: { backgroundColor: "#111A14", borderColor: "#2C3A30" }, optionSelected: { backgroundColor: "#EAF4EC", borderColor: colors.primary }, optionSelectedDark: { backgroundColor: "#20392A", borderColor: "#5C9B70" },
  optionText: { color: colors.textMuted, fontSize: 10, fontWeight: "700" }, optionTextDark: { color: "#AAB8AE" }, optionTextSelected: { color: colors.primary, fontWeight: "800" }, optionTextSelectedDark: { color: "#B9E4C7", fontWeight: "800" },
});
