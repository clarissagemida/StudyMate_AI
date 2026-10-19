import * as LocalAuthentication from "expo-local-authentication";

export type BiometricResult = {
  success: boolean;
  message: string;
};

export async function authenticateWithBiometrics(): Promise<BiometricResult> {
  try {
    // Request device authentication. No availability pre-check is required:
    // the operating system offers biometric sensors when present and, with
    // device credentials enabled, the lock screen PIN/password as fallback.
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Login to StudyMate AI",
      promptSubtitle: "Verify your identity to continue",
      promptDescription:
        "Use your fingerprint, face recognition, or another supported device authentication method.",
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
      biometricsSecurityLevel: "strong",
    });

    if (result.success) {
      return {
        success: true,
        message: "Device authentication successful.",
      };
    }

    // Handle common authentication failures.
    switch (result.error) {
      case "user_cancel":
        return {
          success: false,
          message: "Authentication was cancelled.",
        };

      case "system_cancel":
      case "app_cancel":
        return {
          success: false,
          message: "Verification was interrupted. Please try again.",
        };

      case "not_enrolled":
        return {
          success: false,
          message:
            "No biometric is enrolled. Set one up in your device settings, or use your StudyMate email and password.",
        };

      case "not_available":
      case "passcode_not_set":
        return {
          success: false,
          message:
            "Device authentication is unavailable. Please use your StudyMate email and password.",
        };

      case "lockout":
        return {
          success: false,
          message:
            "Authentication is temporarily locked. Follow your device's instructions or use your StudyMate email and password.",
        };

      case "authentication_failed":
        return {
          success: false,
          message:
            "Identity verification failed. Please try again or use your StudyMate email and password.",
        };

      default:
        return {
          success: false,
          message:
            "Unable to verify your identity. Please try again or use your StudyMate email and password.",
        };
    }
  } catch (error) {
    console.error("Device authentication error:", error);

    return {
      success: false,
      message:
        "Something went wrong during verification. Please use your StudyMate email and password if the problem continues.",
    };
  }
}
