import { useRouter } from "expo-router";
import { useEffect } from "react";
import {
  ActivityIndicator,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/login");
    }, 3500);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#064E2B" />

      <View style={styles.glow} />

      <View style={styles.content}>
        <Image
          source={require("../../assets/images/image.png")}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={styles.welcome}>WELCOME TO</Text>

        <Text style={styles.title}>StudyMate AI</Text>

        <View style={styles.accentLine} />

        <Text style={styles.description}>
          Your personal AI study companion, designed to help you understand
          lessons, review smarter, and test your knowledge with ease.
        </Text>

        <Text style={styles.motto}>
          Learn at your own pace. Achieve with confidence.
        </Text>

        <View style={styles.loading}>
          <ActivityIndicator size="small" color="#B8F28B" />
          <Text style={styles.loadingText}>Preparing your study space...</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerTitle}>STUDYMATE AI</Text>
        <Text style={styles.developer}>Developed by Clarissa Gemida</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#064E2B",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    overflow: "hidden",
  },

  glow: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "#138A43",
    opacity: 0.22,
    top: "13%",
    alignSelf: "center",
  },

  content: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    marginTop: -20,
  },

  logo: {
    width: "100%",
    maxWidth: 310,
    height: 270,
    maxHeight: "38%",
  },

  welcome: {
    color: "#B8F28B",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 3,
    marginTop: 14,
  },

  title: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 0.3,
    textAlign: "center",
    marginTop: 7,
  },

  accentLine: {
    width: 42,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#B8F28B",
    marginTop: 17,
    marginBottom: 18,
  },

  description: {
    color: "#E1EFE5",
    fontSize: 14,
    lineHeight: 23,
    textAlign: "center",
    maxWidth: 320,
    paddingHorizontal: 4,
  },

  motto: {
    color: "#B8F28B",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 19,
    textAlign: "center",
    marginTop: 15,
  },

  loading: {
    alignItems: "center",
    marginTop: 32,
    gap: 10,
  },

  loadingText: {
    color: "#D9F5CF",
    fontSize: 12,
    letterSpacing: 0.2,
  },

  footer: {
    position: "absolute",
    bottom: 26,
    alignItems: "center",
    gap: 8,
  },

  footerTitle: {
    color: "#B8F28B",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 3,
  },

  developer: {
    color: "#D9E8DD",
    fontSize: 11,
    letterSpacing: 0.3,
  },
});
