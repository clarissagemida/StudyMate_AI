import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, Keyframe } from "react-native-reanimated";

const DURATION = 300;

export function AnimatedSplashOverlay() {
  return null;
}

const keyframe = new Keyframe({
  0: {
    transform: [{ scale: 0 }],
  },
  60: {
    transform: [{ scale: 1.2 }],
    easing: Easing.elastic(1.2),
  },
  100: {
    transform: [{ scale: 1 }],
    easing: Easing.elastic(1.2),
  },
});

const logoKeyframe = new Keyframe({
  0: {
    opacity: 0,
  },
  60: {
    transform: [{ scale: 1.2 }],
    opacity: 0,
    easing: Easing.elastic(1.2),
  },
  100: {
    transform: [{ scale: 1 }],
    opacity: 1,
    easing: Easing.elastic(1.2),
  },
});

const glowKeyframe = new Keyframe({
  0: {
    transform: [{ rotateZ: "-180deg" }, { scale: 0.8 }],
    opacity: 0,
  },
  100: {
    transform: [{ rotateZ: "720deg" }, { scale: 1 }],
    opacity: 1,
    easing: Easing.elastic(0.7),
  },
});

export function AnimatedIcon() {
  return (
    <View style={styles.iconContainer}>
      <Animated.View
        entering={glowKeyframe.duration(DURATION)}
        style={styles.glow}
      >
        <Image
          style={styles.glow}
          source={require("@/assets/images/logo-glow.png")}
          contentFit="contain"
        />
      </Animated.View>

      <Animated.View
        entering={keyframe.duration(DURATION)}
        style={styles.background}
      >
        <View style={styles.logoBackground} />
      </Animated.View>

      <Animated.View
        entering={logoKeyframe.duration(DURATION)}
        style={styles.imageContainer}
      >
        <Image
          style={styles.image}
          source={require("@/assets/images/expo-logo.png")}
          contentFit="contain"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  imageContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  iconContainer: {
    justifyContent: "center",
    alignItems: "center",
    width: 128,
    height: 128,
  },
  glow: {
    width: 201,
    height: 201,
    position: "absolute",
  },
  background: {
    width: 128,
    height: 128,
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
  },
  logoBackground: {
    width: 128,
    height: 128,
    borderRadius: 28,
    backgroundColor: "#16794A",
  },
  image: {
    position: "absolute",
    width: 76,
    height: 71,
  },
});
