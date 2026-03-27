import React, { useCallback, useEffect, useRef } from 'react';
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

  useEffect(() => {
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
    ]).start();
  }, [isOpen, translateX, overlayOpacity]);

  const handleLongPress = useCallback(
    (session: Session) => {
      const currentName = session.name ?? formatSessionDate(session.created_at);

      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ['Cancel', 'Rename', 'Delete'],
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
        Alert.alert(currentName, 'Choose an action', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Rename', onPress: () => handleRename(session.id, currentName) },
          {
            text: 'Delete',
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
        'Rename Session',
        'Enter a new name for this session',
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
      Alert.alert('Rename Session', 'Rename is not supported on Android in this version.', [
        { text: 'OK' },
      ]);
    }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      'Delete Session',
      `Are you sure you want to delete "${name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDeleteSession(id),
        },
      ],
    );
  };

  if (!isOpen && translateX.__getValue() === -DRAWER_WIDTH) {
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
          <Text style={styles.headerTitle}>☰ Menu</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.closeButton}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* New Session */}
        <TouchableOpacity style={styles.newSessionButton} onPress={onNewSession} activeOpacity={0.7}>
          <Text style={styles.newSessionText}>+ New Session</Text>
        </TouchableOpacity>

        {/* History */}
        <Text style={styles.historyLabel}>History</Text>

        <ScrollView style={styles.sessionList} showsVerticalScrollIndicator={false}>
          {sessions.length === 0 ? (
            <Text style={styles.emptyText}>No sessions yet</Text>
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
            onPress={() => Alert.alert('Settings', 'Coming soon!')}
          >
            <Text style={styles.settingsText}>⚙ Settings</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_WIDTH,
    backgroundColor: '#1c1c1e',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2c2c2e',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  closeButton: {
    color: '#8e8e93',
    fontSize: 18,
  },
  newSessionButton: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#ff3b30',
    borderRadius: 10,
    alignItems: 'center',
  },
  newSessionText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  historyLabel: {
    color: '#8e8e93',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
  },
  sessionList: {
    flex: 1,
    paddingHorizontal: 12,
  },
  emptyText: {
    color: '#8e8e93',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 24,
  },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 2,
  },
  sessionItemContent: {
    flex: 1,
    marginRight: 8,
  },
  sessionName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 3,
  },
  sessionDate: {
    color: '#8e8e93',
    fontSize: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusCompleted: {
    backgroundColor: '#30d158',
  },
  statusFailed: {
    backgroundColor: '#ff3b30',
  },
  statusOther: {
    backgroundColor: '#8e8e93',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#2c2c2e',
  },
  settingsButton: {
    paddingVertical: 8,
  },
  settingsText: {
    color: '#8e8e93',
    fontSize: 15,
  },
});
