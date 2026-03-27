import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import Drawer from '../../components/Drawer';
import SOAPNoteView from '../../components/SOAPNoteView';
import {
  deleteSession,
  getSession,
  getSessions,
  renameSession,
  retrySoap,
} from '../../services/api';
import type { Session } from '../../services/api';

function formatSessionTitle(session: Session): string {
  if (session.name) return session.name;
  const date = new Date(session.created_at);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);

  const loadSession = useCallback(async () => {
    if (!id) return;
    try {
      const data = await getSession(id);
      setSession(data);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to load session');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  const loadSessions = useCallback(async () => {
    try {
      const data = await getSessions();
      setSessions(data);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    void loadSession();
    void loadSessions();
  }, [loadSession, loadSessions]);

  // Poll while processing
  useEffect(() => {
    if (session?.status !== 'processing') return;

    const pollInterval = setInterval(async () => {
      try {
        if (!id) return;
        const updated = await getSession(id);
        setSession(updated);
        if (updated.status !== 'processing') {
          clearInterval(pollInterval);
        }
      } catch {
        clearInterval(pollInterval);
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [session?.status, id]);

  const handleRetry = useCallback(async () => {
    if (!id) return;
    setIsRetrying(true);
    try {
      const updated = await retrySoap(id);
      setSession(updated);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to retry SOAP generation');
    } finally {
      setIsRetrying(false);
    }
  }, [id]);

  const handleDrawerClose = useCallback(() => {
    setIsDrawerOpen(false);
    void loadSessions();
  }, [loadSessions]);

  const handleSelectSession = useCallback(
    (selectedId: string) => {
      setIsDrawerOpen(false);
      if (selectedId === id) return;
      router.push(`/session/${selectedId}`);
    },
    [id, router],
  );

  const handleRenameSession = useCallback(
    async (sessionId: string, newName: string) => {
      try {
        await renameSession(sessionId, newName);
        await loadSessions();
        if (sessionId === id) {
          await loadSession();
        }
      } catch (err) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Failed to rename session');
      }
    },
    [id, loadSession, loadSessions],
  );

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      try {
        await deleteSession(sessionId);
        await loadSessions();
        if (sessionId === id) {
          router.back();
        }
      } catch (err) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete session');
      }
    },
    [id, loadSessions, router],
  );

  const handleNewSession = useCallback(() => {
    setIsDrawerOpen(false);
    router.push('/');
  }, [router]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.centeredContent}>
          <ActivityIndicator size="large" color="#ff3b30" />
          <Text style={styles.loadingText}>Loading session...</Text>
        </View>
      );
    }

    if (!session) {
      return (
        <View style={styles.centeredContent}>
          <Text style={styles.errorTitle}>Session Not Found</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (session.status === 'processing') {
      return (
        <View style={styles.centeredContent}>
          <ActivityIndicator size="large" color="#ff3b30" />
          <Text style={styles.processingTitle}>Generating SOAP note...</Text>
          <Text style={styles.processingSubtitle}>This may take a moment</Text>
        </View>
      );
    }

    if (session.status === 'failed') {
      return (
        <View style={styles.centeredContent}>
          <Text style={styles.failedIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>SOAP Generation Failed</Text>
          <Text style={styles.errorSubtitle}>Transcript saved successfully</Text>
          <View style={styles.failedActions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.retryButton]}
              onPress={() => void handleRetry()}
              disabled={isRetrying}
              activeOpacity={0.7}
            >
              {isRetrying ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.retryButtonText}>↺  Retry SOAP</Text>
              )}
            </TouchableOpacity>
            {session.raw_transcript && (
              <TouchableOpacity
                style={[styles.actionButton, styles.transcriptButton]}
                onPress={() => {
                  // Show raw transcript in an alert (or could switch to transcript tab)
                  Alert.alert('Transcript', session.raw_transcript ?? '');
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.transcriptButtonText}>View Transcript</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    }

    if (session.status === 'completed' && session.soap_note) {
      return (
        <SOAPNoteView
          soapNote={session.soap_note}
          rawTranscript={session.raw_transcript ?? ''}
        />
      );
    }

    // Fallback for other statuses
    return (
      <View style={styles.centeredContent}>
        <Text style={styles.statusText}>
          Session status: <Text style={styles.statusBadge}>{session.status}</Text>
        </Text>
      </View>
    );
  };

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
        <Text style={styles.headerTitle} numberOfLines={1}>
          {session ? formatSessionTitle(session) : 'Session'}
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.backArrow}
        >
          <Text style={styles.backArrowText}>‹ Back</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>{renderContent()}</View>

      {/* Drawer */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={handleDrawerClose}
        sessions={sessions}
        onSelectSession={handleSelectSession}
        onRenameSession={(sessionId, name) => void handleRenameSession(sessionId, name)}
        onDeleteSession={(sessionId) => void handleDeleteSession(sessionId)}
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
    width: 60,
    alignItems: 'flex-start',
  },
  hamburgerIcon: {
    color: '#ffffff',
    fontSize: 22,
  },
  headerTitle: {
    flex: 1,
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  backArrow: {
    width: 60,
    alignItems: 'flex-end',
  },
  backArrowText: {
    color: '#ff3b30',
    fontSize: 16,
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
  centeredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  loadingText: {
    color: '#8e8e93',
    fontSize: 15,
    marginTop: 8,
  },
  processingTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 8,
  },
  processingSubtitle: {
    color: '#8e8e93',
    fontSize: 14,
  },
  failedIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  errorTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorSubtitle: {
    color: '#8e8e93',
    fontSize: 15,
    textAlign: 'center',
  },
  failedActions: {
    width: '100%',
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  retryButton: {
    backgroundColor: '#ff3b30',
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  transcriptButton: {
    backgroundColor: '#1c1c1e',
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  transcriptButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#1c1c1e',
    borderRadius: 10,
    marginTop: 8,
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
  },
  statusText: {
    color: '#8e8e93',
    fontSize: 15,
  },
  statusBadge: {
    color: '#ffffff',
    fontWeight: '600',
  },
});
