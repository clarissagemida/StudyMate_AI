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
    }, 2500);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#064E2B" />

      <View style={styles.glow} />

      <Image
        source={require("../../assets/images/studymate-logo.png")}
        style={styles.logo}
        resizeMode="contain"
      />

      <Text style={styles.tagline}>Your AI Study Partner</Text>

      <Text style={styles.subtitle}>
        Learn Smarter. Review Faster. Achieve More.
      </Text>

      <View style={styles.loading}>
        <ActivityIndicator size="small" color="#B8F28B" />
        <Text style={styles.loadingText}>Preparing your study space...</Text>
      </View>

      <Text style={styles.footer}>STUDYMATE AI</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#064E2B",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    overflow: "hidden",
  },
  glow: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "#138A43",
    opacity: 0.25,
    top: "20%",
    alignSelf: "center",
  },
  logo: {
    width: "100%",
    maxWidth: 380,
    height: 380,
    maxHeight: "55%",
  },
  tagline: {
    color: "#F4FAF1",
    fontSize: 23,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 8,
  },
  subtitle: {
    color: "#D9F5CF",
    fontSize: 13,
    textAlign: "center",
    marginTop: 10,
  },
  loading: {
    alignItems: "center",
    marginTop: 35,
    gap: 10,
  },
  loadingText: {
    color: "#D9F5CF",
    fontSize: 12,
  },
  footer: {
    position: "absolute",
    bottom: 28,
    color: "#B8F28B",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 3,
  },
});
