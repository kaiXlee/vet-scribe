import { API_URL, API_KEY } from '../constants/config';

export interface SoapNote {
  id: string;
  session_id: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  created_at: string;
}

export interface Session {
  id: string;
  name: string | null;
  status: 'recording' | 'paused' | 'processing' | 'completed' | 'failed';
  audio_s3_key: string | null;
  raw_transcript: string | null;
  duration_seconds: number | null;
  created_at: string;
  ended_at: string | null;
  soap_note: SoapNote | null;
}

const headers = (): HeadersInit => ({
  'Content-Type': 'application/json',
  'X-API-Key': API_KEY,
});

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = await response.json();
      if (body?.detail) {
        message = String(body.detail);
      }
    } catch {
      // ignore parse errors — use default message
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function createSession(): Promise<Session> {
  const response = await fetch(`${API_URL}/sessions`, {
    method: 'POST',
    headers: headers(),
  });
  return handleResponse<Session>(response);
}

export async function getSessions(): Promise<Session[]> {
  const response = await fetch(`${API_URL}/sessions`, {
    method: 'GET',
    headers: headers(),
  });
  return handleResponse<Session[]>(response);
}

export async function getSession(id: string): Promise<Session> {
  const response = await fetch(`${API_URL}/sessions/${id}`, {
    method: 'GET',
    headers: headers(),
  });
  return handleResponse<Session>(response);
}

export async function renameSession(id: string, name: string): Promise<Session> {
  const response = await fetch(`${API_URL}/sessions/${id}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ name }),
  });
  return handleResponse<Session>(response);
}

export async function deleteSession(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/sessions/${id}`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!response.ok) {
    let message = `Delete failed with status ${response.status}`;
    try {
      const body = await response.json();
      if (body?.detail) {
        message = String(body.detail);
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }
}

export async function retrySoap(id: string): Promise<Session> {
  const response = await fetch(`${API_URL}/sessions/${id}/retry-soap`, {
    method: 'POST',
    headers: headers(),
  });
  return handleResponse<Session>(response);
}
