import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { SoapNote } from '../services/api';

interface SOAPNoteViewProps {
  soapNote: SoapNote;
  rawTranscript: string;
}

type TabId = 'soap' | 'transcript';

interface SoapSection {
  key: keyof Pick<SoapNote, 'subjective' | 'objective' | 'assessment' | 'plan'>;
  label: string;
  shortLabel: string;
}

const SOAP_SECTIONS: SoapSection[] = [
  { key: 'subjective', label: '主觀', shortLabel: 'S' },
  { key: 'objective', label: '客觀', shortLabel: 'O' },
  { key: 'assessment', label: '評估', shortLabel: 'A' },
  { key: 'plan', label: '計畫', shortLabel: 'P' },
];

export default function SOAPNoteView({ soapNote, rawTranscript }: SOAPNoteViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>('soap');

  return (
    <View style={styles.container}>
      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={styles.tab}
          onPress={() => setActiveTab('soap')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === 'soap' && styles.tabTextActive]}>
            SOAP 病歷
          </Text>
          {activeTab === 'soap' && <View style={styles.tabIndicator} />}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tab}
          onPress={() => setActiveTab('transcript')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === 'transcript' && styles.tabTextActive]}>
            轉錄稿
          </Text>
          {activeTab === 'transcript' && <View style={styles.tabIndicator} />}
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'soap' ? (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {SOAP_SECTIONS.map((section, index) => (
            <View key={section.key}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionBadge}>
                  <Text style={styles.sectionBadgeText}>{section.shortLabel}</Text>
                </View>
                <Text style={styles.sectionLabel}>{section.label}</Text>
              </View>
              <Text style={styles.sectionContent}>
                {soapNote[section.key] || '未記錄資料。'}
              </Text>
              {index < SOAP_SECTIONS.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.transcriptText}>
            {rawTranscript || '無轉錄稿。'}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    position: 'relative',
  },
  tabText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#0f172a',
    fontWeight: '700',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 2.5,
    backgroundColor: '#3B82F6',
    borderRadius: 2,
  },
  scrollArea: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
    gap: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  sectionBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionBadgeText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  sectionLabel: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  sectionContent: {
    color: '#334155',
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 4,
  },
  transcriptText: {
    color: '#334155',
    fontSize: 15,
    lineHeight: 26,
  },
});
