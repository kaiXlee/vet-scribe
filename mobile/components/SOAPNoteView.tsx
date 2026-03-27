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
  { key: 'subjective', label: 'Subjective', shortLabel: 'S' },
  { key: 'objective', label: 'Objective', shortLabel: 'O' },
  { key: 'assessment', label: 'Assessment', shortLabel: 'A' },
  { key: 'plan', label: 'Plan', shortLabel: 'P' },
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
            SOAP Note
          </Text>
          {activeTab === 'soap' && <View style={styles.tabIndicator} />}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tab}
          onPress={() => setActiveTab('transcript')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === 'transcript' && styles.tabTextActive]}>
            Transcript
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
                {soapNote[section.key] || 'No data recorded.'}
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
            {rawTranscript || 'No transcript available.'}
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
    borderBottomWidth: 1,
    borderBottomColor: '#2c2c2e',
    backgroundColor: '#1c1c1e',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    position: 'relative',
  },
  tabText: {
    color: '#8e8e93',
    fontSize: 15,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '15%',
    right: '15%',
    height: 2,
    backgroundColor: '#ff3b30',
    borderRadius: 1,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  sectionBadge: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#ff3b30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionBadgeText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  sectionLabel: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '600',
  },
  sectionContent: {
    color: '#e0e0e0',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#2c2c2e',
    marginVertical: 20,
  },
  transcriptText: {
    color: '#e0e0e0',
    fontSize: 15,
    lineHeight: 24,
  },
});
