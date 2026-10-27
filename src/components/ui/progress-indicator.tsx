import { colors, radius } from "@/theme/tokens";
import { useEffect, useState } from "react";
import {
  ColorValue,
  LayoutChangeEvent,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

type ProgressSize = "sm" | "md" | "lg";

type ProgressIndicatorProps = {
  /**
   * Completion from 0 to 1 when the remaining work is known. Omit (or pass
   * null) for an indeterminate progress bar.
   */
  progress?: number | null;
  size?: ProgressSize;
  color?: ColorValue;
  trackColor?: ColorValue;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

const sizes: Record<ProgressSize, ViewStyle> = {
  sm: { width: 30, height: 3 },
  md: { width: 112, height: 4 },
  lg: { width: 210, height: 6 },
};

function withOpacity(color: ColorValue, opacity: number): ColorValue {
  if (typeof color !== "string") return `rgba(255, 255, 255, ${opacity})`;

  const value = color.trim();
  const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
  if (shortHex) {
    const [, red, green, blue] = shortHex;
    return `rgba(${parseInt(`${red}${red}`, 16)}, ${parseInt(
      `${green}${green}`,
      16,
    )}, ${parseInt(`${blue}${blue}`, 16)}, ${opacity})`;
  }

  const longHex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (longHex) {
    const [, red, green, blue] = longHex;
    return `rgba(${parseInt(red, 16)}, ${parseInt(green, 16)}, ${parseInt(
      blue,
      16,
    )}, ${opacity})`;
  }

  if (/^rgba?\(/i.test(value)) return value;

  return `rgba(255, 255, 255, ${opacity})`;
}

/**
 * Linear progress bar shared by every waiting state. Pass `progress` when a
 * real completion ratio exists; otherwise the bar sweeps to show activity
 * without pretending to know a percentage.
 */
export function ProgressIndicator({
  progress,
  size = "md",
  color = colors.primary,
  trackColor,
  style,
  accessibilityLabel = "Loading",
}: ProgressIndicatorProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const sweep = useSharedValue(0);
  const determinate = typeof progress === "number" && Number.isFinite(progress);
  const percent = determinate
    ? Math.round(Math.min(1, Math.max(0, progress)) * 100)
    : null;
  const valueText = percent === null ? accessibilityLabel : `${percent}%`;

  useEffect(() => {
    if (determinate) {
      cancelAnimation(sweep);
      return;
    }

    sweep.value = 0;
    sweep.value = withRepeat(
      withTiming(1, {
        duration: 1250,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      false,
    );

    return () => cancelAnimation(sweep);
  }, [determinate, sweep]);

  const segmentWidth = Math.max(16, trackWidth * 0.38);
  const segmentStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: -segmentWidth + sweep.value * (trackWidth + segmentWidth),
      },
    ],
  }));

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (nextWidth !== trackWidth) setTrackWidth(nextWidth);
  };

  const resolvedTrackColor =
    trackColor ?? withOpacity(color, determinate ? 0.2 : 0.22);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: true }}
      accessibilityValue={
        percent === null
          ? { text: accessibilityLabel }
          : { min: 0, max: 100, now: percent, text: valueText }
      }
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      aria-valuetext={valueText}
      onLayout={handleLayout}
      style={[
        styles.track,
        sizes[size],
        { backgroundColor: resolvedTrackColor },
        style,
      ]}
    >
      {percent === null ? (
        <Animated.View
          style={[
            styles.segment,
            {
              width: segmentWidth,
              backgroundColor: color,
            },
            segmentStyle,
          ]}
        />
      ) : (
        <View
          style={[
            styles.fill,
            {
              width: `${percent}%` as `${number}%`,
              backgroundColor: color,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  segment: {
    height: "100%",
    borderRadius: radius.pill,
  },
  fill: {
    height: "100%",
    borderRadius: radius.pill,
  },
});
