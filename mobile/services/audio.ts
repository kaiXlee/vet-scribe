import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

interface AudioChunkCallback {
  onChunk: (base64Audio: string) => void;
  onError: (error: Error) => void;
}

const CHUNK_INTERVAL_MS = 5_000;

const RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: {
    extension: '.wav',
    outputFormat: Audio.AndroidOutputFormat.DEFAULT,
    audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
  },
  ios: {
    extension: '.wav',
    outputFormat: Audio.IOSOutputFormat.LINEARPCM,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/wav',
    bitsPerSecond: 256000,
  },
};

class AudioRecorder {
  private recording: Audio.Recording | null = null;
  private chunkInterval: ReturnType<typeof setInterval> | null = null;
  private isPaused: boolean = false;
  private callbacks: AudioChunkCallback | null = null;

  async start(callbacks: AudioChunkCallback): Promise<void> {
    this.callbacks = callbacks;
    this.isPaused = false;

    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      await this.startNewRecording();

      this.chunkInterval = setInterval(() => {
        if (!this.isPaused) {
          void this.rotateRecording();
        }
      }, CHUNK_INTERVAL_MS);
    } catch (err) {
      this.callbacks?.onError(
        err instanceof Error ? err : new Error('Failed to start recording'),
      );
    }
  }

  async pause(): Promise<void> {
    if (this.isPaused || !this.recording) return;
    this.isPaused = true;
    try {
      await this.recording.pauseAsync();
    } catch (err) {
      this.callbacks?.onError(
        err instanceof Error ? err : new Error('Failed to pause recording'),
      );
    }
  }

  async resume(): Promise<void> {
    if (!this.isPaused || !this.recording) return;
    this.isPaused = false;
    try {
      await this.recording.startAsync();
    } catch (err) {
      this.callbacks?.onError(
        err instanceof Error ? err : new Error('Failed to resume recording'),
      );
    }
  }

  async stop(): Promise<void> {
    this.clearChunkInterval();

    if (this.recording) {
      await this.flushRecording();
    }

    this.recording = null;
    this.callbacks = null;
    this.isPaused = false;
  }

  private async startNewRecording(): Promise<void> {
    const { recording } = await Audio.Recording.createAsync(RECORDING_OPTIONS);
    this.recording = recording;
  }

  private async rotateRecording(): Promise<void> {
    const previousRecording = this.recording;
    this.recording = null;

    if (previousRecording) {
      try {
        await previousRecording.stopAndUnloadAsync();
        const uri = previousRecording.getURI();
        if (uri) {
          const base64 = await FileSystem.readAsStringAsync(uri, {
            encoding: 'base64',
          });
          this.callbacks?.onChunk(base64);
          // Clean up the temporary file
          await FileSystem.deleteAsync(uri, { idempotent: true });
        }
      } catch (err) {
        this.callbacks?.onError(
          err instanceof Error ? err : new Error('Failed to rotate recording'),
        );
      }
    }

    if (!this.isPaused) {
      try {
        await this.startNewRecording();
      } catch (err) {
        this.callbacks?.onError(
          err instanceof Error ? err : new Error('Failed to start new recording segment'),
        );
      }
    }
  }

  private async flushRecording(): Promise<void> {
    const current = this.recording;
    this.recording = null;

    if (!current) return;
    try {
      await current.stopAndUnloadAsync();
      const uri = current.getURI();
      if (uri) {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: 'base64',
        });
        this.callbacks?.onChunk(base64);
        await FileSystem.deleteAsync(uri, { idempotent: true });
      }
    } catch (err) {
      this.callbacks?.onError(
        err instanceof Error ? err : new Error('Failed to flush final recording'),
      );
    }
  }

  private clearChunkInterval(): void {
    if (this.chunkInterval !== null) {
      clearInterval(this.chunkInterval);
      this.chunkInterval = null;
    }
  }
}

export const audioRecorder = new AudioRecorder();
