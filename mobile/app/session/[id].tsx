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
import { MenuIcon, RetryIcon, WarningIcon } from '../../components/Icons';
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
      Alert.alert('錯誤', err instanceof Error ? err.message : '無法載入看診紀錄');
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
      Alert.alert('錯誤', err instanceof Error ? err.message : 'SOAP 重試失敗');
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
        Alert.alert('錯誤', err instanceof Error ? err.message : '重新命名失敗');
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
        Alert.alert('錯誤', err instanceof Error ? err.message : '刪除失敗');
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
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>載入中...</Text>
        </View>
      );
    }

    if (!session) {
      return (
        <View style={styles.centeredContent}>
          <Text style={styles.errorTitle}>找不到看診紀錄</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>返回</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (session.status === 'processing') {
      return (
        <View style={styles.centeredContent}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.processingTitle}>正在生成 SOAP 病歷...</Text>
          <Text style={styles.processingSubtitle}>請稍候</Text>
        </View>
      );
    }

    if (session.status === 'failed') {
      return (
        <View style={styles.centeredContent}>
          <WarningIcon size={48} color="#f59e0b" />
          <Text style={styles.errorTitle}>SOAP 生成失敗</Text>
          <Text style={styles.errorSubtitle}>轉錄稿已儲存</Text>
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <RetryIcon size={16} color="#ffffff" />
                  <Text style={styles.retryButtonText}>重試 SOAP</Text>
                </View>
              )}
            </TouchableOpacity>
            {session.raw_transcript && (
              <TouchableOpacity
                style={[styles.actionButton, styles.transcriptButton]}
                onPress={() => {
                  Alert.alert('轉錄稿', session.raw_transcript ?? '');
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.transcriptButtonText}>檢視轉錄稿</Text>
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

    // Fallback for incomplete/abandoned sessions
    return (
      <View style={styles.centeredContent}>
        <WarningIcon size={48} color="#94a3b8" />
        <Text style={styles.errorTitle}>未完成的看診</Text>
        <Text style={styles.errorSubtitle}>
          此看診紀錄未完成，可能已中斷或放棄。
        </Text>
        {session.raw_transcript ? (
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <RetryIcon size={16} color="#ffffff" />
                  <Text style={styles.retryButtonText}>生成 SOAP</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>返回</Text>
          </TouchableOpacity>
        )}
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
          <MenuIcon color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {session ? formatSessionTitle(session) : '看診紀錄'}
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.backArrow}
        >
          <Text style={styles.backArrowText}>‹ 返回</Text>
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
    width: 60,
    alignItems: 'flex-start',
  },
  headerTitle: {
    flex: 1,
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginHorizontal: 8,
    letterSpacing: -0.2,
  },
  backArrow: {
    width: 60,
    alignItems: 'flex-end',
  },
  backArrowText: {
    color: '#3B82F6',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  centeredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 15,
    fontWeight: '500',
    marginTop: 8,
  },
  processingTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  },
  processingSubtitle: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },
  failedIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  errorTitle: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  errorSubtitle: {
    color: '#64748b',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  failedActions: {
    width: '100%',
    gap: 12,
    marginTop: 12,
  },
  actionButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  retryButton: {
    backgroundColor: '#3B82F6',
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  transcriptButton: {
    backgroundColor: '#ffffff',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  transcriptButtonText: {
    color: '#334155',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    marginTop: 8,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  backButtonText: {
    color: '#334155',
    fontSize: 15,
    fontWeight: '600',
  },
  statusText: {
    color: '#94a3b8',
    fontSize: 15,
  },
  statusBadge: {
    color: '#0f172a',
    fontWeight: '700',
  },
});
