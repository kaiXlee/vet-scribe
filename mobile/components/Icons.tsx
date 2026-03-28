import React from 'react';
import { View } from 'react-native';

interface IconProps {
  size?: number;
  color?: string;
}

export function MenuIcon({ size = 22, color = '#063970' }: IconProps) {
  const barHeight = Math.max(2, size / 11);
  const gap = (size - barHeight * 3) / 2;
  return (
    <View style={{ width: size, height: size, justifyContent: 'center' }}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            width: size,
            height: barHeight,
            backgroundColor: color,
            borderRadius: barHeight / 2,
            marginTop: i === 0 ? 0 : gap,
          }}
        />
      ))}
    </View>
  );
}

export function CloseIcon({ size = 18, color = '#76b5c5' }: IconProps) {
  const thickness = Math.max(2, size / 9);
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <View
        style={{
          position: 'absolute',
          width: size * 0.85,
          height: thickness,
          backgroundColor: color,
          borderRadius: thickness / 2,
          transform: [{ rotate: '45deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: size * 0.85,
          height: thickness,
          backgroundColor: color,
          borderRadius: thickness / 2,
          transform: [{ rotate: '-45deg' }],
        }}
      />
    </View>
  );
}

export function MicIcon({ size = 36, color = '#e24343' }: IconProps) {
  const bodyW = size * 0.35;
  const bodyH = size * 0.5;
  const arcW = size * 0.55;
  const arcH = size * 0.35;
  const stemW = Math.max(2, size * 0.08);
  const baseW = size * 0.35;
  return (
    <View style={{ width: size, height: size, alignItems: 'center' }}>
      {/* Mic body */}
      <View
        style={{
          width: bodyW,
          height: bodyH,
          backgroundColor: color,
          borderRadius: bodyW / 2,
          marginTop: size * 0.02,
        }}
      />
      {/* Arc */}
      <View
        style={{
          position: 'absolute',
          top: size * 0.25,
          width: arcW,
          height: arcH,
          borderWidth: stemW,
          borderColor: color,
          borderTopWidth: 0,
          borderBottomLeftRadius: arcW / 2,
          borderBottomRightRadius: arcW / 2,
        }}
      />
      {/* Stem */}
      <View
        style={{
          width: stemW,
          height: size * 0.15,
          backgroundColor: color,
          marginTop: -1,
        }}
      />
      {/* Base */}
      <View
        style={{
          width: baseW,
          height: stemW,
          backgroundColor: color,
          borderRadius: stemW / 2,
        }}
      />
    </View>
  );
}

export function PauseIcon({ size = 16, color = '#154c79' }: IconProps) {
  const barW = size * 0.25;
  const gap = size * 0.2;
  return (
    <View style={{ width: size, height: size, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap }}>
      <View style={{ width: barW, height: size * 0.7, backgroundColor: color, borderRadius: barW / 4 }} />
      <View style={{ width: barW, height: size * 0.7, backgroundColor: color, borderRadius: barW / 4 }} />
    </View>
  );
}

export function PlayIcon({ size = 16, color = '#154c79' }: IconProps) {
  const triH = size * 0.7;
  const triW = size * 0.6;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: triW,
          borderTopWidth: triH / 2,
          borderBottomWidth: triH / 2,
          borderLeftColor: color,
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
          marginLeft: size * 0.1,
        }}
      />
    </View>
  );
}

export function StopIcon({ size = 16, color = '#ffffff' }: IconProps) {
  const sq = size * 0.55;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: sq, height: sq, backgroundColor: color, borderRadius: sq * 0.15 }} />
    </View>
  );
}

export function RecordDotIcon({ size = 16, color = '#e28743' }: IconProps) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size * 0.75, height: size * 0.75, backgroundColor: color, borderRadius: size }} />
    </View>
  );
}

export function WarningIcon({ size = 48, color = '#e28743' }: IconProps) {
  const triH = size * 0.85;
  const triW = size * 0.95;
  const thickness = Math.max(3, size * 0.07);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Triangle */}
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: triW / 2,
          borderRightWidth: triW / 2,
          borderBottomWidth: triH,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
        }}
      />
      {/* Exclamation mark */}
      <View
        style={{
          position: 'absolute',
          bottom: size * 0.22,
          width: thickness,
          height: size * 0.3,
          backgroundColor: '#ffffff',
          borderRadius: thickness / 2,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: size * 0.1,
          width: thickness * 1.2,
          height: thickness * 1.2,
          backgroundColor: '#ffffff',
          borderRadius: thickness,
        }}
      />
    </View>
  );
}

export function RetryIcon({ size = 16, color = '#ffffff' }: IconProps) {
  const thickness = Math.max(2, size * 0.15);
  const arcSize = size * 0.7;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Arc */}
      <View
        style={{
          width: arcSize,
          height: arcSize,
          borderWidth: thickness,
          borderColor: color,
          borderRadius: arcSize / 2,
          borderRightColor: 'transparent',
        }}
      />
      {/* Arrow head */}
      <View
        style={{
          position: 'absolute',
          top: size * 0.1,
          right: size * 0.12,
          width: 0,
          height: 0,
          borderLeftWidth: size * 0.15,
          borderRightWidth: size * 0.15,
          borderBottomWidth: size * 0.2,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
        }}
      />
    </View>
  );
}

export function GearIcon({ size = 16, color = '#76b5c5' }: IconProps) {
  const toothW = Math.max(2, size * 0.22);
  const toothH = Math.max(2, size * 0.18);
  const ringSize = size * 0.52;
  const ringThickness = Math.max(2, size * 0.1);
  const holeSize = size * 0.2;
  // 6 teeth at 0°, 60°, 120°, 180°, 240°, 300°
  const teeth = [0, 60, 120, 180, 240, 300];
  const toothOffset = size * 0.4; // distance from center to tooth center

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Gear teeth */}
      {teeth.map((angle) => {
        const rad = (angle * Math.PI) / 180;
        const tx = Math.cos(rad) * toothOffset;
        const ty = Math.sin(rad) * toothOffset;
        return (
          <View
            key={angle}
            style={{
              position: 'absolute',
              width: toothW,
              height: toothH,
              backgroundColor: color,
              borderRadius: Math.max(1, toothH * 0.25),
              transform: [
                { translateX: tx },
                { translateY: ty },
                { rotate: `${angle}deg` },
              ],
            }}
          />
        );
      })}
      {/* Outer ring (gear body) */}
      <View
        style={{
          position: 'absolute',
          width: ringSize,
          height: ringSize,
          borderWidth: ringThickness,
          borderColor: color,
          borderRadius: ringSize / 2,
        }}
      />
      {/* Center hole */}
      <View
        style={{
          position: 'absolute',
          width: holeSize,
          height: holeSize,
          backgroundColor: color,
          borderRadius: holeSize / 2,
        }}
      />
    </View>
  );
}
