import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import Drawer from '../components/Drawer';
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
          Alert.alert('Connection Error', message, [
            { text: 'Dismiss', style: 'cancel' },
            {
              text: 'Retry',
              onPress: () => {
                vetScribeWS.connect(session.id, {} as Parameters<typeof vetScribeWS.connect>[1]);
              },
            },
          ]);
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
          Alert.alert('Audio Error', error.message);
          void handleStopInternal();
        },
      });
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to start session');
    }
  }, [router]);

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

  const handleStop = useCallback(() => {
    Alert.alert(
      'End Recording?',
      'This will stop the session and generate the SOAP note.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop',
          style: 'destructive',
          onPress: () => void handleStopInternal(),
        },
      ],
    );
  }, [handleStopInternal]);

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
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to rename session');
    }
  }, []);

  const handleDeleteSession = useCallback(async (id: string) => {
    try {
      await deleteSession(id);
      await loadSessions();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete session');
    }
  }, []);

  const handleNewSession = useCallback(() => {
    setIsDrawerOpen(false);
    if (recordingState === 'idle') {
      void handleRecord();
    }
  }, [recordingState, handleRecord]);

  const isActive = recordingState === 'recording' || recordingState === 'paused';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setIsDrawerOpen(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.hamburger}
        >
          <Text style={styles.hamburgerIcon}>☰</Text>
        </TouchableOpacity>
        <Text style={styles.title}>VetScribe</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Main content */}
      {recordingState === 'idle' && (
        <View style={styles.idleContainer}>
          <RecordButton onPress={() => void handleRecord()} />
          <Text style={styles.subtitle}>Tap to start recording</Text>
        </View>
      )}

      {isActive && (
        <View style={styles.activeContainer}>
          {/* Status bar */}
          <View style={styles.statusRow}>
            <PulsingIndicator isRecording={recordingState === 'recording'} />
            <Text style={styles.timer}>{formatTimer(elapsedSeconds)}</Text>
          </View>

          {/* Live transcript */}
          <View style={styles.transcriptContainer}>
            <Text style={styles.transcriptLabel}>Live Transcript</Text>
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
                  Start speaking — transcript will appear here...
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
              <Text style={styles.controlButtonText}>
                {recordingState === 'recording' ? '⏸  Pause' : '▶  Resume'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.controlButton, styles.stopButton]}
              onPress={handleStop}
              activeOpacity={0.7}
            >
              <Text style={[styles.controlButtonText, styles.stopButtonText]}>■  Stop</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {recordingState === 'processing' && (
        <View style={styles.processingContainer}>
          <ActivityIndicator size="large" color="#ff3b30" />
          <Text style={styles.processingText}>Generating SOAP note...</Text>
          <Text style={styles.processingSubtext}>This may take a moment</Text>
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
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1c1c1e',
  },
  hamburger: {
    width: 44,
    alignItems: 'flex-start',
  },
  hamburgerIcon: {
    color: '#ffffff',
    fontSize: 22,
  },
  title: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  headerRight: {
    width: 44,
  },
  // Idle state
  idleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  subtitle: {
    color: '#8e8e93',
    fontSize: 16,
  },
  // Active (recording/paused) state
  activeContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  timer: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  transcriptContainer: {
    flex: 1,
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    overflow: 'hidden',
  },
  transcriptLabel: {
    color: '#8e8e93',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2c2c2e',
  },
  transcriptScroll: {
    flex: 1,
  },
  transcriptContent: {
    padding: 16,
    flexGrow: 1,
  },
  transcriptText: {
    color: '#e0e0e0',
    fontSize: 16,
    lineHeight: 24,
  },
  transcriptPlaceholder: {
    color: '#3a3a3c',
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
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseButton: {
    backgroundColor: '#1c1c1e',
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  stopButton: {
    backgroundColor: '#ff3b30',
  },
  controlButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  stopButtonText: {
    color: '#ffffff',
  },
  // Processing state
  processingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  processingText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  processingSubtext: {
    color: '#8e8e93',
    fontSize: 14,
  },
});
