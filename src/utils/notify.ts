import { Alert, Platform } from "react-native";

// React Native Web ships an Alert implementation that renders nothing, so any
// confirmation or feedback shown through Alert silently disappears in the
// browser. These helpers pick a presentation that actually renders on the
// current platform while keeping one call site for native.

type ConfirmOptions = {
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export function showNotice(title: string, message?: string): void {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.alert(message ? `${title}\n\n${message}` : title);
    }
    return;
  }

  Alert.alert(title, message);
}

export function confirmAction(
  title: string,
  message: string,
  onConfirm: () => void | Promise<void>,
  options: ConfirmOptions = {},
): void {
  const run = () => {
    Promise.resolve(onConfirm()).catch((error) => {
      console.error(`${title} action failed:`, error);
    });
  };

  if (Platform.OS === "web") {
    if (typeof window === "undefined") return;

    if (window.confirm(message ? `${title}\n\n${message}` : title)) {
      run();
    }

    return;
  }

  Alert.alert(title, message, [
    { text: options.cancelLabel ?? "Cancel", style: "cancel" },
    {
      text: options.confirmLabel ?? "Confirm",
      style: options.destructive ? "destructive" : "default",
      onPress: run,
    },
  ]);
}
