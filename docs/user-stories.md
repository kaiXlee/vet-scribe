# VetScribe AI — User Stories (MVP)

## Actor
**Vet** — the primary and only user for MVP.

---

## Core Recording Flow

| ID | User Story | Acceptance Criteria |
|----|------------|-------------------|
| US-01 | As a vet, I want to press Record immediately without entering any details, so that I don't lose time at the start of a consultation. | Record button is available on the home screen with no required fields. Session is auto-named by date/time (e.g. "Session — Mar 26, 2:30PM"). |
| US-02 | As a vet, I want to rename a session after it has been saved, so that I can label it with the patient's last name at my convenience. | Session name is editable from the history screen or the session detail view. |
| US-03 | As a vet, I want to press a Record button to start capturing the consultation, so that the AI can transcribe it. | Tapping Record opens a WebSocket connection and begins audio capture. |
| US-03 | As a vet, I want to see a pulsing animation while recording is in progress, so that I know the session is actively being captured. | Pulsing indicator visible on screen. Stops animating when paused or stopped. |
| US-04 | As a vet, I want to pause and resume recording during a session, so that I can handle interruptions without ending the consultation. | Pause button visible during recording. Resuming continues the same session transcript. |
| US-05 | As a vet, I want to press Stop to end the session, so that the AI can begin generating the SOAP note. | Stop ends audio capture and triggers SOAP generation. |

---

## SOAP Note Generation

| ID | User Story | Acceptance Criteria |
|----|------------|-------------------|
| US-06 | As a vet, I want the app to automatically generate a SOAP note after I stop recording, so that I don't have to write it manually. | SOAP note generated and displayed within 10 seconds of pressing Stop. |
| US-07 | As a vet, I want to view the generated SOAP note in a structured format (S / O / A / P sections), so that it's easy to read. | Each SOAP section displayed separately with clear labels. |
| US-08 | As a vet, I want to view the raw transcript alongside the SOAP note, so that I can verify accuracy. | Toggle or tab to switch between SOAP note view and raw transcript view. |

---

## Session History

| ID | User Story | Acceptance Criteria |
|----|------------|-------------------|
| US-09 | As a vet, I want to view a list of past sessions, so that I can refer back to previous consultations. | History screen shows list of sessions sorted by most recent. Each entry shows patient last name and date/time. |
| US-10 | As a vet, I want to tap a past session to view its SOAP note and transcript, so that I can review it later. | Tapping a session opens the same SOAP note + transcript view. |

---

## Out of Scope (MVP)

- Exporting or copying SOAP notes to clipboard
- Integration with any vet desktop software
- Full patient profiles (species, breed, DOB, weight)
- Pet owner profiles
- PDF export
- Multi-user / clinic accounts
- Authentication (single user, local for now)
