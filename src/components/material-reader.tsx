import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const GREEN = "#176B45";
const DARK_GREEN = "#123D2A";

export type ReaderMaterial = {
  title: string;
  subject: string;
  topic?: string | null;
  description?: string | null;
  content?: string | null;
};

type Props = {
  material: ReaderMaterial | null;
  visible: boolean;
  loading?: boolean;
  onClose: () => void;
};

function paragraphsOf(content: string): string[] {
  return content
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function MaterialReader({
  material,
  visible,
  loading = false,
  onClose,
}: Props) {
  const content = (material?.content ?? "").trim();
  const paragraphs = paragraphsOf(content);
  const description = (material?.description ?? "").trim();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close lesson"
            hitSlop={10}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={22} color={DARK_GREEN} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Lesson
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {!material ? (
          <View style={styles.center}>
            <ActivityIndicator color={GREEN} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.eyebrow}>STUDY MATERIAL</Text>
            <Text style={styles.title}>{material.title}</Text>
            <Text style={styles.meta}>
              {material.subject}
              {material.topic ? ` · ${material.topic}` : ""}
            </Text>

            {description ? (
              <View style={styles.descriptionBox}>
                <Text style={styles.description}>{description}</Text>
              </View>
            ) : null}

            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={GREEN} />
                <Text style={styles.loadingText}>Loading lesson...</Text>
              </View>
            ) : paragraphs.length > 0 ? (
              <View style={styles.body}>
                {paragraphs.map((paragraph, index) => (
                  <Text key={index} style={styles.paragraph}>
                    {paragraph}
                  </Text>
                ))}
              </View>
            ) : (
              <View style={styles.emptyBox}>
                <Ionicons
                  name="document-text-outline"
                  size={26}
                  color={GREEN}
                />
                <Text style={styles.emptyTitle}>No lesson text yet</Text>
                <Text style={styles.emptyText}>
                  Your teacher has not added the full lesson for this material.
                  Check back later or ask them about it.
                </Text>
              </View>
            )}

            <Text style={styles.footer}>
              Provided by your teacher · StudyMate AI
            </Text>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F4F8F5" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E5EDE7",
    backgroundColor: "#FFFFFF",
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#E8F3EB",
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.8 },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "800",
    color: DARK_GREEN,
  },
  headerSpacer: { width: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 22, paddingBottom: 40, gap: 12 },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.6,
    color: GREEN,
  },
  title: { fontSize: 23, fontWeight: "800", color: DARK_GREEN, lineHeight: 30 },
  meta: { fontSize: 12, color: "#65776B", marginTop: -4 },
  descriptionBox: {
    backgroundColor: "#E8F3EB",
    borderRadius: 14,
    padding: 14,
    marginTop: 4,
  },
  description: { fontSize: 13, lineHeight: 20, color: "#33503F" },
  loadingBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 24,
  },
  loadingText: { fontSize: 13, color: "#65776B" },
  body: { gap: 14, marginTop: 4 },
  paragraph: { fontSize: 15, lineHeight: 24, color: "#263D2E" },
  emptyBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5EDE7",
    padding: 26,
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: DARK_GREEN },
  emptyText: {
    fontSize: 12,
    color: "#758479",
    textAlign: "center",
    lineHeight: 18,
  },
  footer: {
    textAlign: "center",
    color: "#A0AAA3",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginTop: 20,
  },
});
