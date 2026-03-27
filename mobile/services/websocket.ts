import { WS_URL, API_KEY } from '../constants/config';
import type { SoapNote } from './api';

export interface WebSocketCallbacks {
  onTranscript: (text: string) => void;
  onSoap: (data: SoapNote) => void;
  onError: (message: string) => void;
  onPong: () => void;
  onConnected: () => void;
  onDisconnected: () => void;
}

const HEARTBEAT_INTERVAL_MS = 5_000;
const PONG_TIMEOUT_MS = 10_000;
const RECONNECT_DELAY_MS = 2_000;
const MAX_RECONNECT_ATTEMPTS = 3;

class VetScribeWebSocket {
  private ws: WebSocket | null = null;
  private sessionId: string = '';
  private callbacks: WebSocketCallbacks | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pongTimeout: ReturnType<typeof setTimeout> | null = null;
  private isIntentionalClose: boolean = false;
  private reconnectAttempts: number = 0;

  connect(sessionId: string, callbacks: WebSocketCallbacks): void {
    this.sessionId = sessionId;
    this.callbacks = callbacks;
    this.isIntentionalClose = false;
    this.reconnectAttempts = 0;
    this.openConnection();
  }

  disconnect(): void {
    this.isIntentionalClose = true;
    this.reconnectAttempts = 0;
    this.cleanup();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  sendAudioChunk(base64Audio: string): void {
    this.send({ type: 'audio', data: base64Audio });
  }

  sendStop(): void {
    this.send({ type: 'stop' });
  }

  sendPause(): void {
    this.send({ type: 'pause' });
  }

  sendResume(): void {
    this.send({ type: 'resume' });
  }

  private send(payload: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private openConnection(): void {
    const url = `${WS_URL}/ws/sessions/${this.sessionId}?api_key=${API_KEY}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.callbacks?.onConnected();
      this.startHeartbeat();
    };

    ws.onmessage = (event: MessageEvent) => {
      this.handleMessage(event);
    };

    ws.onerror = () => {
      this.callbacks?.onError('WebSocket connection error');
    };

    ws.onclose = () => {
      this.stopHeartbeat();
      this.callbacks?.onDisconnected();
      if (!this.isIntentionalClose) {
        this.handleDisconnect();
      }
    };
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.send({ type: 'ping' });

      // Set a pong timeout — if no pong arrives within 10s, reconnect
      this.pongTimeout = setTimeout(() => {
        this.callbacks?.onError('Heartbeat timeout — reconnecting');
        this.ws?.close();
      }, PONG_TIMEOUT_MS);
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.pongTimeout !== null) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }

  private handleMessage(event: MessageEvent): void {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(String(event.data)) as Record<string, unknown>;
    } catch {
      return;
    }

    const type = data.type as string | undefined;

    switch (type) {
      case 'transcript':
        this.callbacks?.onTranscript(String(data.text ?? ''));
        break;
      case 'soap':
        this.callbacks?.onSoap(data.data as SoapNote);
        break;
      case 'pong':
        // Clear the pong timeout so we don't treat this as dropped
        if (this.pongTimeout !== null) {
          clearTimeout(this.pongTimeout);
          this.pongTimeout = null;
        }
        this.callbacks?.onPong();
        break;
      case 'error':
        this.callbacks?.onError(String(data.message ?? 'Unknown server error'));
        break;
      default:
        break;
    }
  }

  private handleDisconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.callbacks?.onError('Connection lost. Max reconnect attempts reached.');
      return;
    }

    this.reconnectAttempts += 1;
    this.reconnectTimeout = setTimeout(() => {
      if (!this.isIntentionalClose) {
        this.openConnection();
      }
    }, RECONNECT_DELAY_MS);
  }

  private cleanup(): void {
    this.stopHeartbeat();
    if (this.reconnectTimeout !== null) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }
}

export const vetScribeWS = new VetScribeWebSocket();
