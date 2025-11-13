/**
 * Speech-to-Text (STT) configuration options.
 */
export interface STTConfig {
  /** The STT provider to use (e.g., "deepgram", "google") */
  provider: string;
  /** Language code for speech recognition (e.g., "en-US", "es-ES") */
  language: string;
  /** Audio sample rate in Hz (e.g., 16000, 44100) */
  sample_rate: number;
  /** Number of audio channels (1 for mono, 2 for stereo) */
  channels: number;
  /** Whether to include punctuation in transcriptions */
  punctuation: boolean;
  /** Audio encoding format (e.g., "linear16", "opus") */
  encoding: string;
  /** STT model identifier to use */
  model: string;
}

/**
 * Word pronunciation override for text-to-speech.
 */
export interface Pronunciation {
  /** The word to be pronounced differently */
  word: string;
  /** Phonetic pronunciation or alternative spelling */
  pronunciation: string;
}

/**
 * Text-to-Speech (TTS) configuration options.
 */
export interface TTSConfig {
  /** The TTS provider to use (e.g., "elevenlabs", "google") */
  provider: string;
  /** Voice identifier for the selected provider */
  voice_id: string;
  /** Speech rate multiplier (e.g., 1.0 for normal, 1.5 for faster) */
  speaking_rate: number;
  /** Audio format for TTS output (e.g., "mp3", "pcm") */
  audio_format: string;
  /** Audio sample rate in Hz (e.g., 16000, 44100) */
  sample_rate: number;
  /** Connection timeout in milliseconds */
  connection_timeout: number;
  /** Request timeout in milliseconds */
  request_timeout: number;
  /** TTS model identifier to use */
  model: string;
  /** Custom pronunciation overrides */
  pronunciations: Pronunciation[];
}

/**
 * LiveKit room configuration for real-time communication.
 */
export interface LiveKitConfig {
  /** LiveKit room name to join */
  room_name: string;
  /** Whether to enable session recording */
  enable_recording?: boolean;
  /** Storage key for the recording file (required when enable_recording is true) */
  recording_file_key?: string;
  /** Identity assigned to the agent participant (defaults to "sayna-ai") */
  sayna_participant_identity?: string;
  /** Display name for the agent participant (defaults to "Sayna AI") */
  sayna_participant_name?: string;
  /** Optional list of participant identities to monitor; empty list means "all participants" */
  listen_participants?: string[];
}

/**
 * Configuration message sent to initialize the Sayna WebSocket connection.
 * @internal
 */
export interface ConfigMessage {
  type: "config";
  /** Whether audio streaming is enabled */
  audio?: boolean;
  /** Speech-to-text configuration (required when audio=true) */
  stt_config?: STTConfig;
  /** Text-to-speech configuration (required when audio=true) */
  tts_config?: TTSConfig;
  /** Optional LiveKit room configuration */
  livekit?: LiveKitConfig;
}

/**
 * Message to request text-to-speech synthesis.
 * @internal
 */
export interface SpeakMessage {
  type: "speak";
  /** Text to synthesize */
  text: string;
  /** Whether to flush the TTS queue before speaking */
  flush?: boolean;
  /** Whether this speech can be interrupted */
  allow_interruption?: boolean;
}

/**
 * Message to clear the TTS queue.
 * @internal
 */
export interface ClearMessage {
  type: "clear";
}

/**
 * Message to send data to the Sayna session.
 * @internal
 */
export interface SendMessageMessage {
  type: "send_message";
  /** Message content */
  message: string;
  /** Message role (e.g., "user", "assistant") */
  role: string;
  /** Optional topic identifier */
  topic?: string;
  /** Optional debug metadata */
  debug?: Record<string, unknown>;
}

/**
 * Message received when the Sayna connection is ready.
 */
export interface ReadyMessage {
  type: "ready";
  /** LiveKit room name acknowledged by the server (present only when LiveKit is enabled) */
  livekit_room_name?: string;
  /** LiveKit WebSocket URL configured on the server */
  livekit_url: string;
  /** Identity assigned to the agent participant when LiveKit is enabled */
  sayna_participant_identity?: string;
  /** Display name assigned to the agent participant when LiveKit is enabled */
  sayna_participant_name?: string;
}

/**
 * Speech-to-text transcription result.
 */
export interface STTResultMessage {
  type: "stt_result";
  /** Transcribed text */
  transcript: string;
  /** Whether this is a final transcription */
  is_final: boolean;
  /** Whether speech has concluded */
  is_speech_final: boolean;
  /** Transcription confidence score (0-1) */
  confidence: number;
}

/**
 * Error message from the Sayna server.
 */
export interface ErrorMessage {
  type: "error";
  /** Error description */
  message: string;
}

/**
 * Message data from a Sayna session participant.
 */
export interface SaynaMessage {
  /** Message content */
  message?: string;
  /** Additional data payload */
  data?: string;
  /** Participant identity */
  identity: string;
  /** Message topic */
  topic: string;
  /** Room identifier */
  room: string;
  /** Unix timestamp in milliseconds */
  timestamp: number;
}

/**
 * Wrapper for participant messages.
 */
export interface MessageMessage {
  type: "message";
  /** The message data */
  message: SaynaMessage;
}

/**
 * Information about a session participant.
 */
export interface Participant {
  /** Unique participant identity */
  identity: string;
  /** Optional display name */
  name?: string;
  /** Room identifier */
  room: string;
  /** Unix timestamp in milliseconds */
  timestamp: number;
}

/**
 * Message received when a participant disconnects.
 */
export interface ParticipantDisconnectedMessage {
  type: "participant_disconnected";
  /** The disconnected participant */
  participant: Participant;
}

/**
 * Message received when the TTS playback is complete.
 */
export interface TTSPlaybackCompleteMessage {
  type: "tts_playback_complete";
  /** Unix timestamp in milliseconds */
  timestamp: number;
}

/**
 * Union type of all possible messages received from the Sayna server.
 */
export type OutgoingMessage =
  | ReadyMessage
  | STTResultMessage
  | ErrorMessage
  | MessageMessage
  | ParticipantDisconnectedMessage
  | TTSPlaybackCompleteMessage;

/**
 * Voice descriptor returned by the GET /voices endpoint.
 */
export interface Voice {
  /** Provider-specific identifier for the voice profile */
  id: string;
  /** URL to a preview audio sample (may be empty) */
  sample: string;
  /** Human-readable name supplied by the provider */
  name: string;
  /** Detected accent associated with the voice */
  accent: string;
  /** Inferred gender label from provider metadata */
  gender: string;
  /** Primary language for synthesis */
  language: string;
}

/**
 * Response from the GET /voices endpoint.
 * Keys are provider identifiers, values are arrays of voice descriptors.
 */
export type VoicesResponse = Record<string, Voice[]>;

/**
 * Response from the GET / health check endpoint.
 */
export interface HealthResponse {
  /** Status indicator, always "OK" when successful */
  status: string;
}

/**
 * Response from the POST /livekit/token endpoint.
 */
export interface LiveKitTokenResponse {
  /** JWT granting LiveKit permissions for the specified participant */
  token: string;
  /** Echo of the requested room */
  room_name: string;
  /** Echo of the requested identity */
  participant_identity: string;
  /** WebSocket endpoint for the LiveKit server */
  livekit_url: string;
}

