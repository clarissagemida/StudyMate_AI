import { Alert, Platform } from "react-native";

export type SweetAlertVariant = "success" | "error" | "warning" | "info";

export type SweetAlertConfig = {
  title: string;
  message?: string;
  variant: SweetAlertVariant;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm?: () => void | Promise<void>;
};

type Presenter = (config: SweetAlertConfig) => void;
let presenter: Presenter | null = null;

export function registerSweetAlertPresenter(next: Presenter): () => void {
  presenter = next;
  return () => {
    if (presenter === next) presenter = null;
  };
}

function inferVariant(title: string): SweetAlertVariant {
  const value = title.toLowerCase();
  if (/partial|partially|failed|unable|denied|error|wrong|unavailable/.test(value)) return "error";
  if (/success|saved|deleted|approved|published|complete|sent/.test(value)) return "success";
  if (/delete|remove|reject|discard|reset|clear|permanent/.test(value)) return "warning";
  return "info";
}

function present(config: SweetAlertConfig): boolean {
  if (!presenter) return false;
  presenter(config);
  return true;
}

export function showNotice(title: string, message?: string): void {
  const config: SweetAlertConfig = {
    title,
    message,
    variant: inferVariant(title),
    confirmLabel: "Got it",
  };

  if (present(config)) return;

  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }

  Alert.alert(title, message);
}

type ConfirmOptions = {
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export function confirmAction(
  title: string,
  message: string,
  onConfirm: () => void | Promise<void>,
  options: ConfirmOptions = {},
): void {
  const run = () => {
    void Promise.resolve().then(onConfirm).catch((error) => {
      console.error(`${title} action failed:`, error);
    });
  };

  const config: SweetAlertConfig = {
    title,
    message,
    variant: options.destructive ? "warning" : "info",
    confirmLabel: options.confirmLabel ?? "Confirm",
    cancelLabel: options.cancelLabel ?? "Cancel",
    destructive: options.destructive,
    onConfirm: run,
  };

  if (present(config)) return;

  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.confirm(message ? `${title}\n\n${message}` : title)) run();
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
