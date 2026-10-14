import { authenticateWithBiometrics } from "@/utils/biometrics";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Button, StyleSheet, Text, View } from "react-native";

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);

  const handleFingerprintLogin = async () => {
    if (loading) return;

    setLoading(true);

    try {
      const result = await authenticateWithBiometrics();

      if (result.success) {
        Alert.alert("Success", result.message);

        // Temporary navigation for testing only.
        // Verify the Firebase user session before granting access.
        // Change "/(tabs)" if your home route is different.
        router.replace("/(tabs)");
      } else {
        Alert.alert("Login Failed", result.message);
      }
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>StudyMate AI</Text>

      <Text style={styles.subtitle}>Your smart study companion</Text>

      <Text style={styles.description}>
        You can use your fingerprint/pin/pattern/password to continue.
      </Text>

      <View style={styles.button}>
        <Button
          title={loading ? "Authenticating..." : "Login with Fingerprint/Pin"}
          onPress={handleFingerprintLogin}
          disabled={loading}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#F4F8F5",
  },
  title: {
    fontSize: 30,
    fontWeight: "bold",
    color: "#16794A",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#444",
    marginBottom: 30,
  },
  description: {
    fontSize: 15,
    color: "#555",
    marginBottom: 20,
  },
  button: {
    width: "100%",
    maxWidth: 300,
  },
});
