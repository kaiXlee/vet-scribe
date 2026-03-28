import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PauseIcon, RecordDotIcon } from './Icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

interface PulsingIndicatorProps {
  isRecording: boolean;
}

export default function PulsingIndicator({ isRecording }: PulsingIndicatorProps) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (isRecording) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.3, { duration: 600 }),
          withTiming(1.0, { duration: 600 }),
        ),
        -1,
        false,
      );
    } else {
      scale.value = withTiming(1.0, { duration: 200 });
    }
  }, [isRecording, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={animatedStyle}>
        {isRecording ? <RecordDotIcon size={14} color="#ef4444" /> : <PauseIcon size={14} color="#94a3b8" />}
      </Animated.View>
      <Text style={[styles.label, !isRecording && styles.labelPaused]}>
        {isRecording ? '錄音中' : '已暫停'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  labelPaused: {
    color: '#94a3b8',
  },
});
