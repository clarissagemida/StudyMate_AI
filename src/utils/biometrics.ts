import * as LocalAuthentication from "expo-local-authentication";

export type BiometricResult = {
  success: boolean;
  message: string;
};

export async function authenticateWithBiometrics(): Promise<BiometricResult> {
  try {
    // 1. Check whether the device supports biometric hardware
    const hasHardware = await LocalAuthentication.hasHardwareAsync();

    // 2. Check whether the user has enrolled biometrics
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    // 3. Allow biometrics or the phone's screen-lock credentials
    // such as PIN, pattern, or password when supported.
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Login to StudyMate AI",
      promptSubtitle: "Verify your identity to continue",
      promptDescription: "Use your available device authentication method.",
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
      fallbackLabel: "Use device passcode",
    });

    // 4. Authentication succeeded
    if (result.success) {
      return {
        success: true,
        message: "Authentication successful!",
      };
    }

    // 5. Handle cancellation or failed authentication
    if (result.error === "user_cancel") {
      return {
        success: false,
        message: "Authentication was cancelled.",
      };
    }

    if (result.error === "not_enrolled") {
      return {
        success: false,
        message:
          "Set up a screen lock or biometric authentication in your device settings, then try again.",
      };
    }

    if (result.error === "not_available") {
      return {
        success: false,
        message:
          "Device authentication is unavailable. Please log in using your StudyMate account credentials.",
      };
    }

    return {
      success: false,
      message:
        "Authentication failed. Please try again or use your StudyMate account credentials.",
    };
  } catch (error) {
    console.error("Device authentication error:", error);

    return {
      success: false,
      message: "Something went wrong. Please try again.",
    };
  }
}
