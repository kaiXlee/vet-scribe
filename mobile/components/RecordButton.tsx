import React, { useCallback, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

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
          <Text style={styles.icon}>🎙</Text>
          <Text style={[styles.label, disabled && styles.labelDisabled]}>REC</Text>
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
    backgroundColor: '#1c1c1e',
    borderWidth: 3,
    borderColor: '#ff3b30',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ff3b30',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  buttonDisabled: {
    borderColor: '#3a3a3c',
    shadowOpacity: 0,
  },
  inner: {
    alignItems: 'center',
    gap: 4,
  },
  icon: {
    fontSize: 36,
  },
  label: {
    color: '#ff3b30',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
  labelDisabled: {
    color: '#3a3a3c',
  },
});
