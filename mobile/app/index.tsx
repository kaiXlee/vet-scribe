import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated as RNAnimated,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import Drawer from '../components/Drawer';
import { MenuIcon, PauseIcon, PlayIcon, StopIcon } from '../components/Icons';
import PulsingIndicator from '../components/PulsingIndicator';
import RecordButton from '../components/RecordButton';
import { createSession, deleteSession, getSessions, renameSession } from '../services/api';
import type { Session } from '../services/api';
import { audioRecorder } from '../services/audio';
import { vetScribeWS } from '../services/websocket';

type RecordingState = 'idle' | 'recording' | 'paused' | 'processing';

function formatTimer(seconds: number): string {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export default function HomeScreen() {
  const router = useRouter();

  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptScrollRef = useRef<ScrollView>(null);
  const lastErrorRef = useRef<{ message: string; time: number } | null>(null);

  // Transition animations
  const idleOpacity = useRef(new RNAnimated.Value(1)).current;
  const idleScale = useRef(new RNAnimated.Value(1)).current;
  const activeOpacity = useRef(new RNAnimated.Value(0)).current;
  const activeTranslateY = useRef(new RNAnimated.Value(30)).current;

  const showError = useCallback((title: string, message: string) => {
    const now = Date.now();
    const last = lastErrorRef.current;
    if (last && last.message === message && now - last.time < 3000) return;
    lastErrorRef.current = { message, time: now };
    Alert.alert(title, message, [{ text: 'OK' }]);
  }, []);

  // Load sessions on mount
  useEffect(() => {
    void loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const data = await getSessions();
      setSessions(data);
    } catch {
      // Non-critical, silently fail
    }
  };

  // Timer management
  useEffect(() => {
    if (recordingState === 'recording') {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((s) => s + 1);
      }, 1000);
    } else {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
      }
    };
  }, [recordingState]);

  const handleRecord = useCallback(async () => {
    try {
      const session = await createSession();
      setSessionId(session.id);
      setTranscript('');
      setElapsedSeconds(0);

      vetScribeWS.connect(session.id, {
        onTranscript: (text) => {
          setTranscript((prev) => (prev ? prev + ' ' + text : text));
          // Auto-scroll to bottom
          setTimeout(() => {
            transcriptScrollRef.current?.scrollToEnd({ animated: true });
          }, 50);
        },
        onSoap: () => {
          setRecordingState('idle');
          router.push(`/session/${session.id}`);
        },
        onError: (message) => {
          setRecordingState('idle');
          showError('錯誤', message);
        },
        onPong: () => {
          // Heartbeat confirmed — no UI needed
        },
        onConnected: () => {
          setRecordingState('recording');
        },
        onDisconnected: () => {
          // Handled by reconnect logic in websocket service
        },
      });

      audioRecorder.start({
        onChunk: (base64Audio) => {
          vetScribeWS.sendAudioChunk(base64Audio);
        },
        onError: (error) => {
          showError('音訊錯誤', error.message);
          void handleDiscard();
        },
      });
    } catch (err) {
      showError('錯誤', err instanceof Error ? err.message : '無法開始看診紀錄');
    }
  }, [router, handleDiscard, showError]);

  const handlePause = useCallback(async () => {
    if (recordingState !== 'recording') return;
    await audioRecorder.pause();
    vetScribeWS.sendPause();
    setRecordingState('paused');
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [recordingState]);

  const handleResume = useCallback(async () => {
    if (recordingState !== 'paused') return;
    await audioRecorder.resume();
    vetScribeWS.sendResume();
    setRecordingState('recording');
  }, [recordingState]);

  const handleStopInternal = useCallback(async () => {
    await audioRecorder.stop();
    vetScribeWS.sendStop();
    setRecordingState('processing');
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleDiscard = useCallback(async () => {
    await audioRecorder.stop();
    vetScribeWS.disconnect();
    if (sessionId) {
      try {
        await deleteSession(sessionId);
      } catch {
        // Best effort — ignore if delete fails
      }
    }
    setSessionId(null);
    setTranscript('');
    setElapsedSeconds(0);
    setRecordingState('idle');
    void loadSessions();
  }, [sessionId]);

  const handleStop = useCallback(() => {
    Alert.alert(
      '結束錄音？',
      '將停止錄音並生成 SOAP 病歷。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '捨棄',
          style: 'destructive',
          onPress: () => void handleDiscard(),
        },
        {
          text: '停止並生成',
          onPress: () => void handleStopInternal(),
        },
      ],
    );
  }, [handleStopInternal, handleDiscard]);

  const handleDrawerClose = useCallback(() => {
    setIsDrawerOpen(false);
    void loadSessions();
  }, []);

  const handleSelectSession = useCallback(
    (id: string) => {
      setIsDrawerOpen(false);
      router.push(`/session/${id}`);
    },
    [router],
  );

  const handleRenameSession = useCallback(async (id: string, newName: string) => {
    try {
      await renameSession(id, newName);
      await loadSessions();
    } catch (err) {
      showError('錯誤', err instanceof Error ? err.message : '重新命名失敗');
    }
  }, []);

  const handleDeleteSession = useCallback(async (id: string) => {
    try {
      await deleteSession(id);
      await loadSessions();
    } catch (err) {
      showError('錯誤', err instanceof Error ? err.message : '刪除失敗');
    }
  }, []);

  const handleNewSession = useCallback(() => {
    setIsDrawerOpen(false);
  }, []);

  const isActive = recordingState === 'recording' || recordingState === 'paused';

  // Animate transition between idle and active states
  const hasAnimatedRef = useRef(false);
  useEffect(() => {
    if (isActive && !hasAnimatedRef.current) {
      hasAnimatedRef.current = true;
      // Single smooth transition: idle fades/shrinks while active slides up simultaneously
      RNAnimated.parallel([
        RNAnimated.timing(idleOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        RNAnimated.timing(idleScale, { toValue: 0.8, duration: 300, useNativeDriver: true }),
        RNAnimated.timing(activeOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        RNAnimated.timing(activeTranslateY, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start();
    } else if (!isActive && hasAnimatedRef.current) {
      hasAnimatedRef.current = false;
      // Reverse: active slides down and fades, idle scales back in
      RNAnimated.parallel([
        RNAnimated.timing(activeOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
        RNAnimated.timing(activeTranslateY, { toValue: 30, duration: 250, useNativeDriver: true }),
        RNAnimated.timing(idleOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        RNAnimated.timing(idleScale, { toValue: 1, duration: 350, useNativeDriver: true }),
      ]).start();
    }
  }, [isActive, idleOpacity, idleScale, activeOpacity, activeTranslateY]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setIsDrawerOpen(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.hamburger}
        >
          <MenuIcon color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.title}>獸醫抄寫員</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Main content */}
      {recordingState === 'idle' && (
        <RNAnimated.View style={[styles.idleContainer, { opacity: idleOpacity, transform: [{ scale: idleScale }] }]}>
          <RecordButton onPress={() => void handleRecord()} />
          <Text style={styles.subtitle}>點擊開始錄音</Text>
        </RNAnimated.View>
      )}

      {isActive && (
        <RNAnimated.View style={[styles.activeContainer, { opacity: activeOpacity, transform: [{ translateY: activeTranslateY }] }]}>
          {/* Status bar */}
          <View style={styles.statusRow}>
            <PulsingIndicator isRecording={recordingState === 'recording'} />
            <Text style={styles.timer}>{formatTimer(elapsedSeconds)}</Text>
          </View>

          {/* Live transcript */}
          <View style={styles.transcriptContainer}>
            <Text style={styles.transcriptLabel}>即時轉錄</Text>
            <ScrollView
              ref={transcriptScrollRef}
              style={styles.transcriptScroll}
              contentContainerStyle={styles.transcriptContent}
              showsVerticalScrollIndicator={false}
            >
              {transcript ? (
                <Text style={styles.transcriptText}>{transcript}</Text>
              ) : (
                <Text style={styles.transcriptPlaceholder}>
                  開始說話 — 轉錄內容將顯示於此...
                </Text>
              )}
            </ScrollView>
          </View>

          {/* Controls */}
          <View style={styles.controls}>
            <TouchableOpacity
              style={[styles.controlButton, styles.pauseButton]}
              onPress={
                recordingState === 'recording'
                  ? () => void handlePause()
                  : () => void handleResume()
              }
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {recordingState === 'recording' ? <PauseIcon color="#334155" /> : <PlayIcon color="#334155" />}
                <Text style={styles.controlButtonText}>
                  {recordingState === 'recording' ? '暫停' : '繼續'}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.controlButton, styles.stopButton]}
              onPress={handleStop}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <StopIcon />
                <Text style={[styles.controlButtonText, styles.stopButtonText]}>停止</Text>
              </View>
            </TouchableOpacity>
          </View>
        </RNAnimated.View>
      )}

      {recordingState === 'processing' && (
        <View style={styles.processingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.processingText}>正在生成 SOAP 病歷...</Text>
          <Text style={styles.processingSubtext}>請稍候</Text>
          <TouchableOpacity
            style={styles.discardButton}
            onPress={() => void handleDiscard()}
            activeOpacity={0.7}
          >
            <Text style={styles.discardButtonText}>捨棄</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Drawer */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={handleDrawerClose}
        sessions={sessions}
        onSelectSession={handleSelectSession}
        onRenameSession={(id, name) => void handleRenameSession(id, name)}
        onDeleteSession={(id) => void handleDeleteSession(id)}
        onNewSession={handleNewSession}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  hamburger: {
    width: 44,
    alignItems: 'flex-start',
  },
  title: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  headerRight: {
    width: 44,
  },
  idleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingHorizontal: 32,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '500',
    marginTop: 42,
  },
  activeContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    gap: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  timer: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  transcriptContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  transcriptLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
  },
  transcriptScroll: {
    flex: 1,
  },
  transcriptContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexGrow: 1,
  },
  transcriptText: {
    color: '#0f172a',
    fontSize: 16,
    lineHeight: 26,
  },
  transcriptPlaceholder: {
    color: '#cbd5e1',
    fontSize: 15,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  controls: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 4,
  },
  controlButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseButton: {
    backgroundColor: '#ffffff',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  stopButton: {
    backgroundColor: '#ef4444',
  },
  controlButtonText: {
    color: '#334155',
    fontSize: 16,
    fontWeight: '600',
  },
  stopButtonText: {
    color: '#ffffff',
  },
  processingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  processingText: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '700',
  },
  processingSubtext: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },
  discardButton: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  discardButtonText: {
    color: '#64748b',
    fontSize: 15,
    fontWeight: '600',
  },
});
