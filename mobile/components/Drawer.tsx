import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { Session } from '../services/api';
import { CloseIcon, GearIcon, MenuIcon } from './Icons';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: Session[];
  onSelectSession: (id: string) => void;
  onRenameSession: (id: string, currentName: string) => void;
  onDeleteSession: (id: string) => void;
  onNewSession: () => void;
}

const DRAWER_WIDTH = 280;
const ANIMATION_DURATION = 280;

function formatSessionDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Drawer({
  isOpen,
  onClose,
  sessions,
  onSelectSession,
  onRenameSession,
  onDeleteSession,
  onNewSession,
}: DrawerProps) {
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const [isVisible, setIsVisible] = useState(isOpen);

  useEffect(() => {
    if (isOpen) setIsVisible(true);
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: isOpen ? 0 : -DRAWER_WIDTH,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: isOpen ? 0.6 : 0,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (!isOpen) setIsVisible(false);
    });
  }, [isOpen, translateX, overlayOpacity]);

  const handleLongPress = useCallback(
    (session: Session) => {
      const currentName = session.name ?? formatSessionDate(session.created_at);

      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ['取消', '重新命名', '刪除'],
            cancelButtonIndex: 0,
            destructiveButtonIndex: 2,
            title: currentName,
          },
          (buttonIndex) => {
            if (buttonIndex === 1) {
              handleRename(session.id, currentName);
            } else if (buttonIndex === 2) {
              handleDelete(session.id, currentName);
            }
          },
        );
      } else {
        Alert.alert(currentName, '選擇操作', [
          { text: '取消', style: 'cancel' },
          { text: '重新命名', onPress: () => handleRename(session.id, currentName) },
          {
            text: '刪除',
            style: 'destructive',
            onPress: () => handleDelete(session.id, currentName),
          },
        ]);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onRenameSession, onDeleteSession],
  );

  const handleRename = (id: string, currentName: string) => {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        '重新命名',
        '輸入新名稱',
        (newName) => {
          if (newName && newName.trim()) {
            onRenameSession(id, newName.trim());
          }
        },
        'plain-text',
        currentName,
      );
    } else {
      // Android fallback — Alert with plain text
      Alert.alert('重新命名', '此版本尚不支援 Android 重新命名功能。', [
        { text: '確定' },
      ]);
    }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      '刪除紀錄',
      `確定要刪除「${name}」嗎？此操作無法復原。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '刪除',
          style: 'destructive',
          onPress: () => onDeleteSession(id),
        },
      ],
    );
  };

  if (!isVisible) {
    return null;
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={isOpen ? 'auto' : 'none'}>
      {/* Overlay */}
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Drawer panel */}
      <Animated.View style={[styles.drawer, { transform: [{ translateX }] }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <MenuIcon size={18} color="#0f172a" />
            <Text style={styles.headerTitle}>選單</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <CloseIcon color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {/* New Session */}
        <TouchableOpacity style={styles.newSessionButton} onPress={onNewSession} activeOpacity={0.7}>
          <Text style={styles.newSessionText}>+ 新增看診</Text>
        </TouchableOpacity>

        {/* History */}
        <Text style={styles.historyLabel}>歷史紀錄</Text>

        <ScrollView style={styles.sessionList} showsVerticalScrollIndicator={false}>
          {sessions.length === 0 ? (
            <Text style={styles.emptyText}>尚無看診紀錄</Text>
          ) : (
            sessions.map((session) => (
              <TouchableOpacity
                key={session.id}
                style={styles.sessionItem}
                onPress={() => onSelectSession(session.id)}
                onLongPress={() => handleLongPress(session)}
                activeOpacity={0.7}
                delayLongPress={400}
              >
                <View style={styles.sessionItemContent}>
                  <Text style={styles.sessionName} numberOfLines={1}>
                    {session.name ?? formatSessionDate(session.created_at)}
                  </Text>
                  <Text style={styles.sessionDate}>
                    {formatSessionDate(session.created_at)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusDot,
                    session.status === 'completed'
                      ? styles.statusCompleted
                      : session.status === 'failed'
                        ? styles.statusFailed
                        : styles.statusOther,
                  ]}
                />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>

        {/* Settings placeholder */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => Alert.alert('設定', '即將推出！')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <GearIcon size={16} color="#94a3b8" />
              <Text style={styles.settingsText}>設定</Text>
            </View>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0f172a',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_WIDTH,
    backgroundColor: '#ffffff',
    shadowColor: '#0f172a',
    shadowOffset: { width: 8, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 20,
  },
  headerTitle: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  closeButton: {
    color: '#94a3b8',
    fontSize: 18,
  },
  newSessionButton: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#3B82F6',
    borderRadius: 14,
    alignItems: 'center',
  },
  newSessionText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  historyLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginHorizontal: 24,
    marginTop: 20,
    marginBottom: 8,
  },
  sessionList: {
    flex: 1,
    paddingHorizontal: 12,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 32,
    fontWeight: '500',
  },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 2,
  },
  sessionItemContent: {
    flex: 1,
    marginRight: 8,
  },
  sessionName: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 3,
  },
  sessionDate: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '500',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusCompleted: {
    backgroundColor: '#22c55e',
  },
  statusFailed: {
    backgroundColor: '#ef4444',
  },
  statusOther: {
    backgroundColor: '#cbd5e1',
  },
  footer: {
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  settingsButton: {
    paddingVertical: 8,
  },
  settingsText: {
    color: '#94a3b8',
    fontSize: 15,
    fontWeight: '500',
  },
});
