import React, { useCallback, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { MicIcon } from './Icons';

interface RecordButtonProps {
  onPress: () => void;
  disabled?: boolean;
}

export default function RecordButton({ onPress, disabled = false }: RecordButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.92,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 10,
    }).start();
  }, [scaleAnim]);

  return (
    <TouchableWithoutFeedback
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
    >
      <Animated.View
        style={[
          styles.button,
          disabled && styles.buttonDisabled,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        <View style={styles.inner}>
          <MicIcon size={36} color="#ffffff" />
          <Text style={[styles.label, disabled && styles.labelDisabled]}>錄音</Text>
        </View>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  buttonDisabled: {
    backgroundColor: '#cbd5e1',
    shadowOpacity: 0,
  },
  inner: {
    alignItems: 'center',
    gap: 6,
  },
  icon: {
    fontSize: 36,
  },
  label: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.5,
  },
  labelDisabled: {
    color: '#e2e8f0',
  },
});
