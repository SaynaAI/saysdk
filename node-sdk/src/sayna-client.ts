import type {
  STTConfig,
  TTSConfig,
  LiveKitConfig,
  ConfigMessage,
  SpeakMessage,
  ClearMessage,
  SendMessageMessage,
  STTResultMessage,
  ErrorMessage,
  SipTransferErrorMessage,
  SipTransferMessage,
  OutgoingMessage,
  SaynaMessage,
  Participant,
  Track,
  VoicesResponse,
  HealthResponse,
  LiveKitTokenResponse,
  LiveKitRoomsResponse,
  LiveKitRoomDetails,
  SipHook,
  SipHooksResponse,
  RemoveLiveKitParticipantResponse,
  MuteLiveKitParticipantResponse,
  SipTransferResponse,
  SipCallRequest,
  SipCallResponse,
  SipCallSipConfig,
} from "./types";
import {
  SaynaNotConnectedError,
  SaynaNotReadyError,
  SaynaConnectionError,
  SaynaValidationError,
  SaynaServerError,
} from "./errors";
// Runtime detection for WebSocket selection
const isBun =
  typeof process !== "undefined" &&
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  typeof process.versions?.bun === "string";
const isNode =
  typeof process !== "undefined" &&
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  typeof process.versions?.node === "string" &&
  !isBun;

// Node.js: always use ws package (native WebSocket via undici is unreliable).
// Bun/Deno: use the built-in native WebSocket.
let WS: typeof WebSocket;
if (isNode) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef
  WS = require("ws") as typeof WebSocket;
} else if (typeof globalThis.WebSocket !== "undefined") {
  WS = globalThis.WebSocket;
} else {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef
  WS = require("ws") as typeof WebSocket;
}

// Node.js 18+ has native fetch support
declare const fetch: typeof globalThis.fetch;

type JsonObject = Record<string, unknown>;

/**
 * Event handler for speech-to-text results.
 */
export type STTResultHandler = (
  result: STTResultMessage
) => void | Promise<void>;

/**
 * Event handler for text-to-speech audio data.
 */
export type TTSAudioHandler = (audio: ArrayBuffer) => void | Promise<void>;

/**
 * Event handler for error messages.
 */
export type ErrorHandler = (error: ErrorMessage) => void | Promise<void>;

/**
 * Event handler for participant messages.
 */
export type MessageHandler = (message: SaynaMessage) => void | Promise<void>;

/**
 * Event handler for participant disconnections.
 */
export type ParticipantDisconnectedHandler = (
  participant: Participant
) => void | Promise<void>;

/**
 * Event handler for participant connection events.
 */
export type ParticipantConnectedHandler = (
  participant: Participant
) => void | Promise<void>;

/**
 * Event handler for track subscription events.
 */
export type TrackSubscribedHandler = (track: Track) => void | Promise<void>;

/**
 * Event handler for TTS playback completion.
 */
export type TTSPlaybackCompleteHandler = (
  timestamp: number
) => void | Promise<void>;

/**
 * Event handler for SIP transfer specific errors.
 */
export type SipTransferErrorHandler = (
  error: SipTransferErrorMessage
) => void | Promise<void>;

/**
 * Client for connecting to Sayna WebSocket server for real-time voice interactions.
 *
 * @example
 * ```typescript
 * const client = await saynaConnect(
 *   "https://api.sayna.ai",
 *   sttConfig,
 *   ttsConfig
 * );
 *
 * client.registerOnSttResult((result) => {
 *   console.log("Transcription:", result.transcript);
 * });
 *
 * await client.speak("Hello, world!");
 * ```
 */
export class SaynaClient {
  private url: string;
  private sttConfig?: STTConfig;
  private ttsConfig?: TTSConfig;
  private livekitConfig?: LiveKitConfig;
  private withoutAudio: boolean;
  private apiKey?: string;
  private websocket?: InstanceType<typeof WebSocket>;
  private isConnected: boolean = false;
  private isReady: boolean = false;
  private _livekitRoomName?: string;
  private _livekitUrl?: string;
  private _saynaParticipantIdentity?: string;
  private _saynaParticipantName?: string;
  private _streamId?: string;
  private inputStreamId?: string;
  private sttCallback?: STTResultHandler;
  private ttsCallback?: TTSAudioHandler;
  private errorCallback?: ErrorHandler;
  private messageCallback?: MessageHandler;
  private participantConnectedCallback?: ParticipantConnectedHandler;
  private participantDisconnectedCallback?: ParticipantDisconnectedHandler;
  private trackSubscribedCallback?: TrackSubscribedHandler;
  private ttsPlaybackCompleteCallback?: TTSPlaybackCompleteHandler;
  private sipTransferErrorCallback?: SipTransferErrorHandler;
  private readyPromiseResolve?: () => void;
  private readyPromiseReject?: (error: Error) => void;

  /**
   * Creates a new SaynaClient instance.
   *
   * @param url - The Sayna server URL (e.g., "https://api.sayna.ai")
   * @param sttConfig - Speech-to-text configuration (required when withoutAudio=false)
   * @param ttsConfig - Text-to-speech configuration (required when withoutAudio=false)
   * @param livekitConfig - Optional LiveKit room configuration
   * @param withoutAudio - If true, disables audio streaming (default: false)
   * @param apiKey - Optional API key used to authorize HTTP and WebSocket calls (defaults to SAYNA_API_KEY env)
   * @param streamId - Optional session identifier for recording paths; server generates a UUID when omitted
   *
   * @throws {SaynaValidationError} If URL is invalid or if audio configs are missing when audio is enabled
   */
  constructor(
    url: string,
    sttConfig?: STTConfig,
    ttsConfig?: TTSConfig,
    livekitConfig?: LiveKitConfig,
    withoutAudio: boolean = false,
    apiKey?: string,
    streamId?: string
  ) {
    // Validate URL
    if (!url || typeof url !== "string") {
      throw new SaynaValidationError("URL must be a non-empty string");
    }
    if (
      !url.startsWith("http://") &&
      !url.startsWith("https://") &&
      !url.startsWith("ws://") &&
      !url.startsWith("wss://")
    ) {
      throw new SaynaValidationError(
        "URL must start with http://, https://, ws://, or wss://"
      );
    }

    // Validate audio config requirements
    if (!withoutAudio) {
      if (!sttConfig || !ttsConfig) {
        throw new SaynaValidationError(
          "sttConfig and ttsConfig are required when withoutAudio=false (audio streaming enabled). " +
            "Either provide both configs or set withoutAudio=true for non-audio use cases."
        );
      }
    }

    this.url = url;
    this.sttConfig = sttConfig;
    this.ttsConfig = ttsConfig;
    this.livekitConfig = livekitConfig;
    this.withoutAudio = withoutAudio;
    this.apiKey = apiKey ?? process.env.SAYNA_API_KEY;
    this.inputStreamId = streamId;
  }

  /**
   * Establishes connection to the Sayna WebSocket server.
   *
   * @throws {SaynaConnectionError} If connection fails
   * @returns Promise that resolves when the connection is ready
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    const wsUrl = this.getWebSocketUrl();

    return new Promise((resolve, reject) => {
      this.readyPromiseResolve = resolve;
      this.readyPromiseReject = reject;

      try {
        this.websocket = this.createWebSocket(wsUrl);
        this.websocket.binaryType = "arraybuffer";

        this.websocket.onopen = () => {
          this.isConnected = true;

          // Send initial configuration
          const configMessage: ConfigMessage = {
            type: "config",
            stream_id: this.inputStreamId,
            stt_config: this.sttConfig,
            tts_config: this.ttsConfig,
            livekit: this.livekitConfig,
            audio: !this.withoutAudio,
          };

          try {
            if (this.websocket) {
              this.websocket.send(JSON.stringify(configMessage));
            }
          } catch (error) {
            this.cleanup();
            const err = new SaynaConnectionError(
              "Failed to send configuration",
              error
            );
            if (this.readyPromiseReject) {
              this.readyPromiseReject(err);
            }
          }
        };

        this.websocket.onmessage = (event) => {
          void this.handleWebSocketMessage(event);
        };

        this.websocket.onerror = () => {
          const error = new SaynaConnectionError("WebSocket connection error");
          if (this.readyPromiseReject && !this.isReady) {
            this.readyPromiseReject(error);
          }
        };

        this.websocket.onclose = (event) => {
          const wasReady = this.isReady;
          this.cleanup();

          // If connection closed before ready, reject the promise
          if (!wasReady && this.readyPromiseReject) {
            const reason = event.reason && event.reason.length > 0 ? event.reason : "none";
            this.readyPromiseReject(
              new SaynaConnectionError(
                `WebSocket closed before ready (code: ${event.code}, reason: ${reason})`
              )
            );
          }
        };
      } catch (error) {
        reject(new SaynaConnectionError("Failed to create WebSocket", error));
      }
    });
  }

  /**
   * Handles incoming WebSocket message events.
   * @internal
   */
  private async handleWebSocketMessage(
    event: MessageEvent
  ): Promise<void> {
    try {
      if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
        const buffer =
          event.data instanceof Blob
            ? await event.data.arrayBuffer()
            : event.data;
        await this.invokeCallback(this.ttsCallback, buffer, "TTS audio");
      } else {
        if (typeof event.data !== "string") {
          this.logProtocolWarning(
            "Ignoring websocket message with unsupported non-binary payload type",
            event.data
          );
          return;
        }

        let data: unknown;
        try {
          data = JSON.parse(event.data);
        } catch (error) {
          this.logProtocolWarning(
            `Ignoring invalid websocket JSON: ${this.describeError(error)}`,
            event.data
          );
          return;
        }

        await this.handleJsonMessage(data);
      }
    } catch (error) {
      await this.reportHandlerError("WebSocket message", error);
    }
  }

  /**
   * Handles incoming JSON messages from the WebSocket.
   * @internal
   */
  private async handleJsonMessage(raw: unknown): Promise<void> {
    const data = this.parseIncomingMessage(raw);
    if (!data) {
      return;
    }

    const messageType = data.type;

    try {
      switch (messageType) {
        case "ready": {
          const readyMsg = data;
          this.isReady = true;
          this._livekitRoomName = readyMsg.livekit_room_name;
          this._livekitUrl = readyMsg.livekit_url;
          this._saynaParticipantIdentity = readyMsg.sayna_participant_identity;
          this._saynaParticipantName = readyMsg.sayna_participant_name;
          this._streamId = readyMsg.stream_id;
          if (this.readyPromiseResolve) {
            this.readyPromiseResolve();
          }
          break;
        }

        case "stt_result": {
          await this.invokeCallback(this.sttCallback, data, "STT result");
          break;
        }

        case "error": {
          await this.invokeCallback(this.errorCallback, data, "error");
          if (this.readyPromiseReject && !this.isReady) {
            this.readyPromiseReject(new SaynaServerError(data.message));
          }
          break;
        }

        case "sip_transfer_error": {
          if (this.sipTransferErrorCallback) {
            await this.invokeCallback(
              this.sipTransferErrorCallback,
              data,
              "SIP transfer error"
            );
          } else if (this.errorCallback) {
            await this.errorCallback({
              type: "error",
              message: data.message,
            });
          }
          break;
        }

        case "message": {
          await this.invokeCallback(
            this.messageCallback,
            data.message,
            "message"
          );
          break;
        }

        case "participant_connected": {
          await this.invokeCallback(
            this.participantConnectedCallback,
            data.participant,
            "participant connected"
          );
          break;
        }

        case "participant_disconnected": {
          await this.invokeCallback(
            this.participantDisconnectedCallback,
            data.participant,
            "participant disconnected"
          );
          break;
        }

        case "track_subscribed": {
          await this.invokeCallback(
            this.trackSubscribedCallback,
            data.track,
            "track subscribed"
          );
          break;
        }

        case "tts_playback_complete": {
          await this.invokeCallback(
            this.ttsPlaybackCompleteCallback,
            data.timestamp,
            "TTS playback complete"
          );
          break;
        }
      }
    } catch (error) {
      await this.reportHandlerError(`"${messageType}"`, error);
    }
  }

  private getWebSocketUrl(): string {
    const wsUrl = this.url
      .replace(/^https:\/\//, "wss://")
      .replace(/^http:\/\//, "ws://");
    const parsedUrl = new URL(wsUrl);

    if (!parsedUrl.pathname.endsWith("/ws")) {
      parsedUrl.pathname = parsedUrl.pathname.endsWith("/")
        ? `${parsedUrl.pathname}ws`
        : `${parsedUrl.pathname}/ws`;
    }

    return parsedUrl.toString();
  }

  private parseIncomingMessage(raw: unknown): OutgoingMessage | undefined {
    if (!this.isJsonObject(raw)) {
      this.logProtocolWarning(
        "Ignoring websocket payload because it is not a JSON object",
        raw
      );
      return undefined;
    }

    const messageType = raw.type;
    if (typeof messageType !== "string") {
      this.logProtocolWarning(
        'Ignoring websocket payload without a string "type" field',
        raw
      );
      return undefined;
    }

    try {
      switch (messageType) {
        case "ready":
          return {
            type: "ready",
            stream_id: this.getOptionalString(raw, "stream_id"),
            livekit_room_name: this.getOptionalString(raw, "livekit_room_name"),
            livekit_url: this.getOptionalString(raw, "livekit_url"),
            sayna_participant_identity: this.getOptionalString(
              raw,
              "sayna_participant_identity"
            ),
            sayna_participant_name: this.getOptionalString(
              raw,
              "sayna_participant_name"
            ),
          };
        case "stt_result":
          return {
            type: "stt_result",
            transcript: this.getRequiredString(raw, "transcript"),
            is_final: this.getRequiredBoolean(raw, "is_final"),
            is_speech_final: this.getRequiredBoolean(raw, "is_speech_final"),
            confidence: this.getRequiredNumber(raw, "confidence"),
          };
        case "error":
          return {
            type: "error",
            message: this.getRequiredString(raw, "message"),
          };
        case "sip_transfer_error":
          return {
            type: "sip_transfer_error",
            message: this.getRequiredString(raw, "message"),
          };
        case "message":
          return {
            type: "message",
            message: this.parseSaynaMessage(raw, "message"),
          };
        case "participant_connected":
          return {
            type: "participant_connected",
            participant: this.parseParticipant(raw, "participant"),
          };
        case "participant_disconnected":
          return {
            type: "participant_disconnected",
            participant: this.parseParticipant(raw, "participant"),
          };
        case "track_subscribed":
          return {
            type: "track_subscribed",
            track: this.parseTrack(raw, "track"),
          };
        case "tts_playback_complete":
          return {
            type: "tts_playback_complete",
            timestamp: this.getRequiredNumber(raw, "timestamp"),
          };
        default:
          this.logProtocolWarning(
            `Ignoring unknown websocket message type "${messageType}"`,
            raw
          );
          return undefined;
      }
    } catch (error) {
      this.logProtocolWarning(
        `Ignoring malformed websocket message "${messageType}": ${this.describeError(error)}`,
        raw
      );
      return undefined;
    }
  }

  private parseSaynaMessage(
    container: JsonObject,
    fieldName: string
  ): SaynaMessage {
    const message = this.getRequiredObject(container, fieldName);
    return {
      message: this.getOptionalString(message, "message"),
      data: this.getOptionalString(message, "data"),
      identity: this.getRequiredString(message, "identity"),
      topic: this.getRequiredString(message, "topic"),
      room: this.getRequiredString(message, "room"),
      timestamp: this.getRequiredNumber(message, "timestamp"),
    };
  }

  private parseParticipant(
    container: JsonObject,
    fieldName: string
  ): Participant {
    const participant = this.getRequiredObject(container, fieldName);
    return {
      identity: this.getRequiredString(participant, "identity"),
      name: this.getOptionalString(participant, "name"),
      room: this.getRequiredString(participant, "room"),
      timestamp: this.getRequiredNumber(participant, "timestamp"),
    };
  }

  private parseTrack(container: JsonObject, fieldName: string): Track {
    const track = this.getRequiredObject(container, fieldName);
    const trackKind = this.getRequiredString(track, "track_kind");
    if (trackKind !== "audio" && trackKind !== "video") {
      throw new Error(
        'Field "track_kind" must be either "audio" or "video"'
      );
    }

    return {
      identity: this.getRequiredString(track, "identity"),
      name: this.getOptionalString(track, "name"),
      track_kind: trackKind,
      track_sid: this.getRequiredString(track, "track_sid"),
      room: this.getRequiredString(track, "room"),
      timestamp: this.getRequiredNumber(track, "timestamp"),
    };
  }

  private getRequiredObject(
    container: JsonObject,
    fieldName: string
  ): JsonObject {
    const value = container[fieldName];
    if (!this.isJsonObject(value)) {
      throw new Error(`Field "${fieldName}" must be an object`);
    }
    return value;
  }

  private getRequiredString(container: JsonObject, fieldName: string): string {
    const value = container[fieldName];
    if (typeof value !== "string") {
      throw new Error(`Field "${fieldName}" must be a string`);
    }
    return value;
  }

  private getOptionalString(
    container: JsonObject,
    fieldName: string
  ): string | undefined {
    const value = container[fieldName];
    if (typeof value === "undefined" || value === null) {
      return undefined;
    }
    if (typeof value !== "string") {
      throw new Error(`Field "${fieldName}" must be a string when present`);
    }
    return value;
  }

  private getRequiredBoolean(
    container: JsonObject,
    fieldName: string
  ): boolean {
    const value = container[fieldName];
    if (typeof value !== "boolean") {
      throw new Error(`Field "${fieldName}" must be a boolean`);
    }
    return value;
  }

  private getRequiredNumber(container: JsonObject, fieldName: string): number {
    const value = container[fieldName];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`Field "${fieldName}" must be a finite number`);
    }
    return value;
  }

  private isJsonObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private logProtocolWarning(message: string, payload: unknown): void {
    console.warn(`${message}; payload=${this.safeStringify(payload)}`);
  }

  private safeStringify(payload: unknown): string {
    try {
      return JSON.stringify(payload);
    } catch {
      return String(payload);
    }
  }

  private describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private async invokeCallback<T>(
    callback: ((payload: T) => void | Promise<void>) | undefined,
    payload: T,
    label: string
  ): Promise<void> {
    if (!callback) {
      return;
    }

    try {
      await callback(payload);
    } catch (error) {
      await this.reportHandlerError(`${label} callback`, error);
    }
  }

  private async reportHandlerError(
    label: string,
    error: unknown
  ): Promise<void> {
    const message = `${label} failed: ${this.describeError(error)}`;

    if (!this.errorCallback) {
      console.error(message);
      return;
    }

    try {
      await this.errorCallback({
        type: "error",
        message,
      });
    } catch (callbackError) {
      console.error(message);
      console.error(
        `error callback failed: ${this.describeError(callbackError)}`
      );
    }
  }

  /**
   * Creates a WebSocket instance using the appropriate constructor for the current runtime.
   * - Node.js (ws package): passes headers via third argument
   * - Bun: passes headers in the second options argument
   * - Deno / standard: appends token as query parameter (no custom header support)
   * @internal
   */
  private createWebSocket(url: string): InstanceType<typeof WebSocket> {
    if (!this.apiKey) {
      return new WS(url);
    }

    const headers = { Authorization: `Bearer ${this.apiKey}` };

    if (isNode) {
      return new (WS as unknown as new (url: string, protocols: undefined, opts: { headers: Record<string, string> }) => InstanceType<typeof WebSocket>)(url, undefined, { headers });
    }

    if (isBun) {
      return new (WS as unknown as new (url: string, opts: { headers: Record<string, string> }) => InstanceType<typeof WebSocket>)(url, { headers });
    }

    // Deno / standard WebSocket: no custom header support — send token as query param
    const separator = url.includes("?") ? "&" : "?";
    const urlWithToken = `${url}${separator}token=${encodeURIComponent(this.apiKey)}`;
    return new WS(urlWithToken);
  }

  /**
   * Cleans up internal state.
   * @internal
   */
  private cleanup(): void {
    this.isConnected = false;
    this.isReady = false;
    this._livekitRoomName = undefined;
    this._livekitUrl = undefined;
    this._saynaParticipantIdentity = undefined;
    this._saynaParticipantName = undefined;
    this._streamId = undefined;
  }

  /**
   * Converts WebSocket URL to HTTP URL for REST API calls.
   * @internal
   */
  private getHttpUrl(): string {
    return this.url
      .replace(/^ws:\/\//, "http://")
      .replace(/^wss:\/\//, "https://");
  }

  /**
   * Generic fetch helper for making REST API calls to Sayna server.
   * Handles URL construction, headers, error responses, and type conversion.
   * @internal
   *
   * @param endpoint - API endpoint path (e.g., "/voices", "/speak")
   * @param options - Fetch options including method, body, headers, etc.
   * @param responseType - Expected response type: "json" or "arrayBuffer"
   * @returns Promise resolving to the parsed response
   * @throws {SaynaConnectionError} If the network request fails
   * @throws {SaynaServerError} If the server returns an error response (includes status and endpoint)
   */
  private async fetchFromSayna<T>(
    endpoint: string,
    options: RequestInit = {},
    responseType: "json" | "arrayBuffer" = "json"
  ): Promise<T> {
    const httpUrl = this.getHttpUrl();
    const normalizedEndpoint = endpoint.startsWith("/")
      ? endpoint.slice(1)
      : endpoint;
    const url = `${httpUrl}${httpUrl.endsWith("/") ? "" : "/"}${normalizedEndpoint}`;

    // Merge default headers with user-provided headers
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    // Add Authorization header when an API key is provided, unless user supplied one
    const hasAuthHeader = Object.keys(headers).some(
      (key) => key.toLowerCase() === "authorization"
    );
    if (this.apiKey && !hasAuthHeader) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    // Add Content-Type for JSON requests with body if not already set
    if (options.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        // Try to parse error message from JSON response
        let errorMessage: string;
        try {
          const errorData: unknown = await response.json();
          errorMessage =
            errorData &&
            typeof errorData === "object" &&
            "error" in errorData &&
            typeof errorData.error === "string"
              ? errorData.error
              : `Request failed: ${response.status} ${response.statusText}`;
        } catch {
          errorMessage = `Request failed: ${response.status} ${response.statusText}`;
        }

        // Enhance error messages for specific status codes
        if (response.status === 403) {
          errorMessage = `Access denied: ${errorMessage}`;
        } else if (response.status === 404) {
          errorMessage = `Not found or not accessible: ${errorMessage}`;
        }

        throw new SaynaServerError(
          errorMessage,
          response.status,
          normalizedEndpoint
        );
      }

      // Parse response based on expected type
      if (responseType === "arrayBuffer") {
        return (await response.arrayBuffer()) as T;
      } else {
        return (await response.json()) as T;
      }
    } catch (error) {
      // Re-throw SaynaServerError as-is
      if (error instanceof SaynaServerError) {
        throw error;
      }
      // Wrap other errors in SaynaConnectionError
      throw new SaynaConnectionError(`Failed to fetch from ${endpoint}`, error);
    }
  }

  /**
   * Disconnects from the Sayna WebSocket server and cleans up resources.
   */
  disconnect(): void {
    if (this.websocket) {
      // Remove event handlers to prevent memory leaks
      this.websocket.onopen = null;
      this.websocket.onmessage = null;
      this.websocket.onerror = null;
      this.websocket.onclose = null;

      if (this.websocket.readyState === WS.OPEN) {
        this.websocket.close(1000, "Client disconnect");
      }

      this.websocket = undefined;
    }

    this.cleanup();
  }

  /**
   * Sends audio data to the server for speech recognition.
   *
   * @param audioData - Raw audio data as ArrayBuffer
   * @throws {SaynaNotConnectedError} If not connected
   * @throws {SaynaNotReadyError} If connection is not ready
   */
  onAudioInput(audioData: ArrayBuffer): void {
    if (!this.isConnected || !this.websocket) {
      throw new SaynaNotConnectedError();
    }

    if (!this.isReady) {
      throw new SaynaNotReadyError();
    }

    if (!(audioData instanceof ArrayBuffer)) {
      throw new SaynaValidationError("audioData must be an ArrayBuffer");
    }

    if (audioData.byteLength === 0) {
      throw new SaynaValidationError("audioData cannot be empty");
    }

    try {
      this.websocket.send(audioData);
    } catch (error) {
      throw new SaynaConnectionError("Failed to send audio data", error);
    }
  }

  /**
   * Registers a callback for speech-to-text results.
   *
   * @param callback - Function to call when STT results are received
   */
  registerOnSttResult(callback: STTResultHandler): void {
    this.sttCallback = callback;
  }

  /**
   * Registers a callback for text-to-speech audio data.
   *
   * @param callback - Function to call when TTS audio is received
   */
  registerOnTtsAudio(callback: TTSAudioHandler): void {
    this.ttsCallback = callback;
  }

  /**
   * Registers a callback for error messages.
   *
   * @param callback - Function to call when errors occur
   */
  registerOnError(callback: ErrorHandler): void {
    this.errorCallback = callback;
  }

  /**
   * Registers a callback for participant messages.
   *
   * @param callback - Function to call when messages are received
   */
  registerOnMessage(callback: MessageHandler): void {
    this.messageCallback = callback;
  }

  /**
   * Registers a callback for participant connection events.
   *
   * @param callback - Function to call when a participant connects
   */
  registerOnParticipantConnected(
    callback: ParticipantConnectedHandler
  ): void {
    this.participantConnectedCallback = callback;
  }

  /**
   * Registers a callback for participant disconnection events.
   *
   * @param callback - Function to call when a participant disconnects
   */
  registerOnParticipantDisconnected(
    callback: ParticipantDisconnectedHandler
  ): void {
    this.participantDisconnectedCallback = callback;
  }

  /**
   * Registers a callback for track subscription events.
   *
   * @param callback - Function to call when Sayna subscribes to a track
   */
  registerOnTrackSubscribed(callback: TrackSubscribedHandler): void {
    this.trackSubscribedCallback = callback;
  }

  /**
   * Registers a callback for TTS playback completion.
   *
   * @param callback - Function to call when TTS playback is complete
   */
  registerOnTtsPlaybackComplete(callback: TTSPlaybackCompleteHandler): void {
    this.ttsPlaybackCompleteCallback = callback;
  }

  /**
   * Registers a callback for SIP transfer specific errors.
   *
   * @param callback - Function to call when a SIP transfer error message is received
   */
  registerOnSipTransferError(callback: SipTransferErrorHandler): void {
    this.sipTransferErrorCallback = callback;
  }

  /**
   * Sends text to be synthesized as speech.
   *
   * @param text - Text to synthesize
   * @param flush - Whether to flush the TTS queue before speaking (default: true)
   * @param allowInterruption - Whether this speech can be interrupted (default: true)
   * @throws {SaynaNotConnectedError} If not connected
   * @throws {SaynaNotReadyError} If connection is not ready
   * @throws {SaynaValidationError} If text is not a string
   */
  speak(
    text: string,
    flush: boolean = true,
    allowInterruption: boolean = true
  ): void {
    if (!this.isConnected || !this.websocket) {
      throw new SaynaNotConnectedError();
    }

    if (!this.isReady) {
      throw new SaynaNotReadyError();
    }

    if (typeof text !== "string") {
      throw new SaynaValidationError("text must be a string");
    }

    try {
      const speakMessage: SpeakMessage = {
        type: "speak",
        text,
        flush,
        allow_interruption: allowInterruption,
      };
      this.websocket.send(JSON.stringify(speakMessage));
    } catch (error) {
      throw new SaynaConnectionError("Failed to send speak command", error);
    }
  }

  /**
   * Clears the text-to-speech queue.
   *
   * @throws {SaynaNotConnectedError} If not connected
   * @throws {SaynaNotReadyError} If connection is not ready
   */
  clear(): void {
    if (!this.isConnected || !this.websocket) {
      throw new SaynaNotConnectedError();
    }

    if (!this.isReady) {
      throw new SaynaNotReadyError();
    }

    try {
      const clearMessage: ClearMessage = {
        type: "clear",
      };
      this.websocket.send(JSON.stringify(clearMessage));
    } catch (error) {
      throw new SaynaConnectionError("Failed to send clear command", error);
    }
  }

  /**
   * Flushes the TTS queue by sending an empty speak command.
   *
   * @param allowInterruption - Whether the flush can be interrupted (default: true)
   * @throws {SaynaNotConnectedError} If not connected
   * @throws {SaynaNotReadyError} If connection is not ready
   */
  ttsFlush(allowInterruption: boolean = true): void {
    this.speak("", true, allowInterruption);
  }

  /**
   * Sends a message to the Sayna session.
   *
   * @param message - Message content
   * @param role - Message role (e.g., "user", "assistant")
   * @param topic - Optional topic identifier
   * @param debug - Optional debug metadata
   * @throws {SaynaNotConnectedError} If not connected
   * @throws {SaynaNotReadyError} If connection is not ready
   * @throws {SaynaValidationError} If parameters are invalid
   */
  sendMessage(
    message: string,
    role: string,
    topic?: string,
    debug?: Record<string, unknown>
  ): void {
    if (!this.isConnected || !this.websocket) {
      throw new SaynaNotConnectedError();
    }

    if (!this.isReady) {
      throw new SaynaNotReadyError();
    }

    if (typeof message !== "string") {
      throw new SaynaValidationError("message must be a string");
    }

    if (typeof role !== "string") {
      throw new SaynaValidationError("role must be a string");
    }

    try {
      const sendMsg: SendMessageMessage = {
        type: "send_message",
        message,
        role,
        topic,
        debug,
      };
      this.websocket.send(JSON.stringify(sendMsg));
    } catch (error) {
      throw new SaynaConnectionError("Failed to send message", error);
    }
  }

  /**
   * Initiates a SIP transfer for the active LiveKit session.
   *
   * @param transferTo - Destination phone number or extension to transfer to
   * @throws {SaynaNotConnectedError} If not connected
   * @throws {SaynaNotReadyError} If connection is not ready
   * @throws {SaynaValidationError} If transferTo is not a non-empty string
   */
  sipTransfer(transferTo: string): void {
    if (!this.isConnected || !this.websocket) {
      throw new SaynaNotConnectedError();
    }

    if (!this.isReady) {
      throw new SaynaNotReadyError();
    }

    if (typeof transferTo !== "string" || transferTo.trim().length === 0) {
      throw new SaynaValidationError("transfer_to must be a non-empty string");
    }

    try {
      const sipTransferMessage: SipTransferMessage = {
        type: "sip_transfer",
        transfer_to: transferTo.trim(),
      };
      this.websocket.send(JSON.stringify(sipTransferMessage));
    } catch (error) {
      throw new SaynaConnectionError(
        "Failed to send SIP transfer command",
        error
      );
    }
  }

  /**
   * Performs a health check on the Sayna server.
   *
   * @returns Promise that resolves with the health status
   * @throws {SaynaConnectionError} If the request fails
   * @throws {SaynaServerError} If server returns an error
   *
   * @example
   * ```typescript
   * const health = await client.health();
   * console.log(health.status); // "OK"
   * ```
   */
  async health(): Promise<HealthResponse> {
    return this.fetchFromSayna<HealthResponse>("");
  }

  /**
   * Retrieves the catalogue of text-to-speech voices grouped by provider.
   *
   * @returns Promise that resolves with voices organized by provider
   * @throws {SaynaConnectionError} If the request fails
   * @throws {SaynaServerError} If server returns an error
   *
   * @example
   * ```typescript
   * const voices = await client.getVoices();
   * for (const [provider, voiceList] of Object.entries(voices)) {
   *   console.log(`${provider}:`, voiceList.map(v => v.name));
   * }
   * ```
   */
  async getVoices(): Promise<VoicesResponse> {
    return this.fetchFromSayna<VoicesResponse>("voices");
  }

  /**
   * Synthesizes text into audio using the REST API endpoint.
   * This is a standalone synthesis method that doesn't require an active WebSocket connection.
   *
   * @param text - Text to synthesize
   * @param ttsConfig - Text-to-speech configuration
   * @returns Promise that resolves with the audio data as ArrayBuffer
   * @throws {SaynaValidationError} If text is empty
   * @throws {SaynaConnectionError} If the request fails
   * @throws {SaynaServerError} If server returns an error
   *
   * @example
   * ```typescript
   * const audioBuffer = await client.speakRest("Hello, world!", {
   *   provider: "elevenlabs",
   *   voice_id: "21m00Tcm4TlvDq8ikWAM",
   *   model: "eleven_turbo_v2",
   *   speaking_rate: 1.0,
   *   audio_format: "mp3",
   *   sample_rate: 24000,
   *   connection_timeout: 30,
   *   request_timeout: 60,
   *   pronunciations: []
   * });
   * ```
   */
  async speakRest(text: string, ttsConfig: TTSConfig): Promise<ArrayBuffer> {
    if (!text || text.trim().length === 0) {
      throw new SaynaValidationError("Text cannot be empty");
    }

    return this.fetchFromSayna<ArrayBuffer>(
      "speak",
      {
        method: "POST",
        body: JSON.stringify({
          text,
          tts_config: ttsConfig,
        }),
      },
      "arrayBuffer"
    );
  }

  /**
   * Issues a LiveKit access token for a participant.
   *
   * Room names are used as-is; the SDK does not rewrite or prefix them. When authentication
   * is enabled, this endpoint creates the room if missing and sets room ownership metadata.
   *
   * @param roomName - LiveKit room to join or create. Provide the clean room name without any prefix.
   * @param participantName - Display name assigned to the participant
   * @param participantIdentity - Unique identifier for the participant
   * @returns Promise that resolves with the LiveKit token and connection details
   * @throws {SaynaValidationError} If any parameter is empty
   * @throws {SaynaConnectionError} If the request fails
   * @throws {SaynaServerError} If server returns an error. A 403 status indicates the room
   *   is owned by another tenant; do not retry with a modified room name.
   *
   * @example
   * ```typescript
   * const tokenInfo = await client.getLiveKitToken(
   *   "my-room",
   *   "John Doe",
   *   "user-123"
   * );
   * console.log("Token:", tokenInfo.token);
   * console.log("LiveKit URL:", tokenInfo.livekit_url);
   * ```
   */
  async getLiveKitToken(
    roomName: string,
    participantName: string,
    participantIdentity: string
  ): Promise<LiveKitTokenResponse> {
    if (!roomName || roomName.trim().length === 0) {
      throw new SaynaValidationError("room_name cannot be empty");
    }

    if (!participantName || participantName.trim().length === 0) {
      throw new SaynaValidationError("participant_name cannot be empty");
    }

    if (!participantIdentity || participantIdentity.trim().length === 0) {
      throw new SaynaValidationError("participant_identity cannot be empty");
    }

    return this.fetchFromSayna<LiveKitTokenResponse>("livekit/token", {
      method: "POST",
      body: JSON.stringify({
        room_name: roomName,
        participant_name: participantName,
        participant_identity: participantIdentity,
      }),
    });
  }

  /**
   * Lists LiveKit rooms accessible to the authenticated context.
   *
   * Room listings are scoped server-side based on authentication. When authentication is
   * enabled, this endpoint may return fewer rooms than before (only those you have access to).
   * Room names are not modified by the SDK.
   *
   * @returns Promise that resolves with the list of accessible rooms
   * @throws {SaynaConnectionError} If the request fails
   * @throws {SaynaServerError} If server returns an error (e.g., LiveKit not configured)
   *
   * @example
   * ```typescript
   * const response = await client.getLiveKitRooms();
   * for (const room of response.rooms) {
   *   console.log(`Room: ${room.name}, Participants: ${room.num_participants}`);
   * }
   * ```
   */
  async getLiveKitRooms(): Promise<LiveKitRoomsResponse> {
    return this.fetchFromSayna<LiveKitRoomsResponse>("livekit/rooms");
  }

  /**
   * Retrieves detailed information about a specific LiveKit room including participants.
   *
   * Room names are used as-is; the SDK does not rewrite or prefix them. Access is
   * enforced server-side based on room ownership metadata.
   *
   * @param roomName - Name of the room to retrieve
   * @returns Promise that resolves with detailed room information including participants
   * @throws {SaynaValidationError} If roomName is empty
   * @throws {SaynaConnectionError} If the request fails
   * @throws {SaynaServerError} If server returns an error. A 404 status can mean "not found"
   *   or "not accessible" when room ownership is enforced.
   *
   * @example
   * ```typescript
   * const room = await client.getLiveKitRoom("my-room");
   * console.log(`Room: ${room.name}, SID: ${room.sid}`);
   * console.log(`Participants: ${room.num_participants}/${room.max_participants}`);
   * for (const participant of room.participants) {
   *   console.log(`  - ${participant.name} (${participant.identity}): ${participant.state}`);
   * }
   * ```
   */
  async getLiveKitRoom(roomName: string): Promise<LiveKitRoomDetails> {
    if (!roomName || roomName.trim().length === 0) {
      throw new SaynaValidationError("room_name cannot be empty");
    }

    const encoded = encodeURIComponent(roomName.trim());
    return this.fetchFromSayna<LiveKitRoomDetails>(`livekit/rooms/${encoded}`);
  }

  /**
   * Removes a participant from a LiveKit room, forcibly disconnecting them.
   *
   * Room names are used as-is; the SDK does not rewrite or prefix them. Access is
   * enforced server-side based on room ownership metadata.
   *
   * **Important:** This does not invalidate the participant's token. To prevent
   * rejoining, use short-lived tokens and avoid issuing new tokens to removed participants.
   *
   * @param roomName - Name of the room where the participant is connected
   * @param participantIdentity - The identity of the participant to remove
   * @returns Promise that resolves with the removal confirmation
   * @throws {SaynaValidationError} If roomName or participantIdentity is empty
   * @throws {SaynaConnectionError} If the request fails
   * @throws {SaynaServerError} If server returns an error. A 404 status can mean "not found"
   *   or "not accessible" when room ownership is enforced.
   *
   * @example
   * ```typescript
   * const result = await client.removeLiveKitParticipant("my-room", "user-alice-456");
   * console.log(`Status: ${result.status}`);
   * console.log(`Removed from room: ${result.room_name}`);
   * console.log(`Participant: ${result.participant_identity}`);
   * ```
   */
  async removeLiveKitParticipant(
    roomName: string,
    participantIdentity: string
  ): Promise<RemoveLiveKitParticipantResponse> {
    if (!roomName || roomName.trim().length === 0) {
      throw new SaynaValidationError("room_name cannot be empty");
    }

    if (!participantIdentity || participantIdentity.trim().length === 0) {
      throw new SaynaValidationError("participant_identity cannot be empty");
    }

    return this.fetchFromSayna<RemoveLiveKitParticipantResponse>(
      "livekit/participant",
      {
        method: "DELETE",
        body: JSON.stringify({
          room_name: roomName.trim(),
          participant_identity: participantIdentity.trim(),
        }),
      }
    );
  }

  /**
   * Mutes or unmutes a participant's published track in a LiveKit room.
   *
   * Room names are used as-is; the SDK does not rewrite or prefix them. Access is
   * enforced server-side based on room ownership metadata.
   *
   * @param roomName - Name of the room where the participant is connected
   * @param participantIdentity - The identity of the participant whose track to mute
   * @param trackSid - The session ID of the track to mute/unmute
   * @param muted - True to mute, false to unmute
   * @returns Promise that resolves with the mute operation result
   * @throws {SaynaValidationError} If roomName, participantIdentity, or trackSid is empty, or if muted is not a boolean
   * @throws {SaynaConnectionError} If the request fails
   * @throws {SaynaServerError} If server returns an error. A 404 status can mean "not found"
   *   or "not accessible" when room ownership is enforced.
   *
   * @example
   * ```typescript
   * // Mute a participant's track
   * const result = await client.muteLiveKitParticipantTrack(
   *   "my-room",
   *   "user-alice-456",
   *   "TR_abc123",
   *   true
   * );
   * console.log(`Track ${result.track_sid} muted: ${result.muted}`);
   *
   * // Unmute the track
   * const unmuteResult = await client.muteLiveKitParticipantTrack(
   *   "my-room",
   *   "user-alice-456",
   *   "TR_abc123",
   *   false
   * );
   * ```
   */
  async muteLiveKitParticipantTrack(
    roomName: string,
    participantIdentity: string,
    trackSid: string,
    muted: boolean
  ): Promise<MuteLiveKitParticipantResponse> {
    if (!roomName || roomName.trim().length === 0) {
      throw new SaynaValidationError("room_name cannot be empty");
    }

    if (!participantIdentity || participantIdentity.trim().length === 0) {
      throw new SaynaValidationError("participant_identity cannot be empty");
    }

    if (!trackSid || trackSid.trim().length === 0) {
      throw new SaynaValidationError("track_sid cannot be empty");
    }

    if (typeof muted !== "boolean") {
      throw new SaynaValidationError("muted must be a boolean");
    }

    return this.fetchFromSayna<MuteLiveKitParticipantResponse>(
      "livekit/participant/mute",
      {
        method: "POST",
        body: JSON.stringify({
          room_name: roomName.trim(),
          participant_identity: participantIdentity.trim(),
          track_sid: trackSid.trim(),
          muted,
        }),
      }
    );
  }

  /**
   * Initiates a SIP call transfer via the REST API endpoint.
   *
   * This is distinct from the WebSocket `sipTransfer()` method. Use this REST endpoint
   * when you need to transfer a SIP call from outside the active WebSocket session,
   * or when you want to specify a particular room and participant explicitly.
   *
   * Room names are used as-is; the SDK does not rewrite or prefix them. Access is
   * enforced server-side based on room ownership metadata.
   *
   * **Important Notes:**
   * - Only SIP participants can be transferred
   * - A successful response indicates the transfer has been **initiated**, not necessarily completed
   * - The actual transfer may take several seconds
   *
   * @param roomName - Name of the room where the SIP participant is connected
   * @param participantIdentity - The identity of the SIP participant to transfer
   * @param transferTo - The phone number to transfer to (international, national, or extension format)
   * @returns Promise that resolves with the transfer status
   * @throws {SaynaValidationError} If roomName, participantIdentity, or transferTo is empty
   * @throws {SaynaConnectionError} If the request fails
   * @throws {SaynaServerError} If server returns an error. A 404 status can mean "not found"
   *   or "not accessible" when room ownership is enforced.
   *
   * @example
   * ```typescript
   * // Transfer a SIP participant to another phone number
   * const result = await client.sipTransferRest(
   *   "call-room-123",
   *   "sip_participant_456",
   *   "+15551234567"
   * );
   * console.log(`Transfer status: ${result.status}`);
   * console.log(`Transferred to: ${result.transfer_to}`);
   * ```
   */
  async sipTransferRest(
    roomName: string,
    participantIdentity: string,
    transferTo: string
  ): Promise<SipTransferResponse> {
    if (!roomName || roomName.trim().length === 0) {
      throw new SaynaValidationError("room_name cannot be empty");
    }

    if (!participantIdentity || participantIdentity.trim().length === 0) {
      throw new SaynaValidationError("participant_identity cannot be empty");
    }

    if (!transferTo || transferTo.trim().length === 0) {
      throw new SaynaValidationError("transfer_to cannot be empty");
    }

    return this.fetchFromSayna<SipTransferResponse>("sip/transfer", {
      method: "POST",
      body: JSON.stringify({
        room_name: roomName.trim(),
        participant_identity: participantIdentity.trim(),
        transfer_to: transferTo.trim(),
      }),
    });
  }

  /**
   * Initiates an outbound SIP call via the REST API endpoint.
   *
   * Creates a new outbound SIP call to the specified phone number and places it
   * in a LiveKit room. Optionally allows per-request SIP server configuration
   * overrides to use different SIP providers or credentials.
   *
   * Room names are used as-is; the SDK does not rewrite or prefix them. Access is
   * enforced server-side based on room ownership metadata.
   *
   * @param roomName - LiveKit room name to place the call in
   * @param participantName - Display name for the SIP participant
   * @param participantIdentity - Unique identity for the SIP participant
   * @param fromPhoneNumber - Caller's phone number (E.164 format)
   * @param toPhoneNumber - Destination phone number (E.164 format)
   * @param sipConfig - Optional SIP configuration overrides
   * @returns Promise that resolves with the call initiation status
   * @throws {SaynaValidationError} If any required parameter is empty
   * @throws {SaynaConnectionError} If the request fails
   * @throws {SaynaServerError} If server returns an error
   *
   * @example
   * ```typescript
   * // Basic outbound call
   * const result = await client.sipCall(
   *   "call-room-123",
   *   "John Doe",
   *   "caller-456",
   *   "+15105550123",
   *   "+15551234567"
   * );
   * console.log(`Call initiated: ${result.sip_call_id}`);
   *
   * // With SIP configuration overrides
   * const result = await client.sipCall(
   *   "call-room-123",
   *   "John Doe",
   *   "caller-456",
   *   "+15105550123",
   *   "+15551234567",
   *   {
   *     outbound_address: "sip.provider.com:5060",
   *     auth_username: "user123",
   *     auth_password: "secret456"
   *   }
   * );
   * ```
   */
  async sipCall(
    roomName: string,
    participantName: string,
    participantIdentity: string,
    fromPhoneNumber: string,
    toPhoneNumber: string,
    sipConfig?: SipCallSipConfig
  ): Promise<SipCallResponse> {
    if (!roomName || roomName.trim().length === 0) {
      throw new SaynaValidationError("room_name cannot be empty");
    }

    if (!participantName || participantName.trim().length === 0) {
      throw new SaynaValidationError("participant_name cannot be empty");
    }

    if (!participantIdentity || participantIdentity.trim().length === 0) {
      throw new SaynaValidationError("participant_identity cannot be empty");
    }

    if (!fromPhoneNumber || fromPhoneNumber.trim().length === 0) {
      throw new SaynaValidationError("from_phone_number cannot be empty");
    }

    if (!toPhoneNumber || toPhoneNumber.trim().length === 0) {
      throw new SaynaValidationError("to_phone_number cannot be empty");
    }

    const body: SipCallRequest = {
      room_name: roomName.trim(),
      participant_name: participantName.trim(),
      participant_identity: participantIdentity.trim(),
      from_phone_number: fromPhoneNumber.trim(),
      to_phone_number: toPhoneNumber.trim(),
    };

    // Only include sip config if provided
    if (sipConfig) {
      body.sip = sipConfig;
    }

    return this.fetchFromSayna<SipCallResponse>("sip/call", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * Downloads the recorded audio file for a completed session.
   *
   * @param streamId - The session identifier (obtained from the `streamId` getter after connection)
   * @returns Promise that resolves with the audio data as ArrayBuffer (OGG format)
   * @throws {SaynaValidationError} If streamId is empty
   * @throws {SaynaConnectionError} If the network request fails
   * @throws {SaynaServerError} If the recording is not found or server returns an error
   *
   * @example
   * ```typescript
   * // After a session completes, download the recording
   * const audioBuffer = await client.getRecording(client.streamId!);
   *
   * // Save to file (Node.js)
   * import { writeFile } from "fs/promises";
   * await writeFile("recording.ogg", Buffer.from(audioBuffer));
   * ```
   */
  async getRecording(streamId: string): Promise<ArrayBuffer> {
    if (!streamId || streamId.trim().length === 0) {
      throw new SaynaValidationError("streamId cannot be empty");
    }

    return this.fetchFromSayna<ArrayBuffer>(
      `recording/${encodeURIComponent(streamId)}`,
      { method: "GET" },
      "arrayBuffer"
    );
  }

  /**
   * Retrieves all configured SIP webhook hooks from the runtime cache.
   *
   * @returns Promise that resolves with the list of configured SIP hooks
   * @throws {SaynaConnectionError} If the request fails
   * @throws {SaynaServerError} If server returns an error (e.g., 500 if reading cache fails)
   *
   * @example
   * ```typescript
   * const response = await client.getSipHooks();
   * for (const hook of response.hooks) {
   *   console.log(`Host: ${hook.host}, URL: ${hook.url}`);
   * }
   * ```
   */
  async getSipHooks(): Promise<SipHooksResponse> {
    return this.fetchFromSayna<SipHooksResponse>("sip/hooks");
  }

  /**
   * Sets or updates SIP webhook hooks in the runtime cache.
   *
   * Hooks with matching hosts will be replaced; new hosts will be added.
   * The response contains the merged list of all hooks (existing + new).
   *
   * @param hooks - Array of SIP hook configurations to add or replace
   * @returns Promise that resolves with the merged list of all configured hooks
   * @throws {SaynaValidationError} If hooks array is empty or contains invalid entries
   * @throws {SaynaConnectionError} If the request fails
   * @throws {SaynaServerError} If server returns an error (e.g., 400 for duplicate hosts, 500 for cache errors)
   *
   * @example
   * ```typescript
   * const response = await client.setSipHooks([
   *   { host: "example.com", url: "https://webhook.example.com/events", auth_id: "tenant-123" },
   *   { host: "another.com", url: "https://webhook.another.com/events", auth_id: "" }  // Empty for unauthenticated mode
   * ]);
   * console.log("Total hooks configured:", response.hooks.length);
   * ```
   */
  async setSipHooks(hooks: SipHook[]): Promise<SipHooksResponse> {
    if (!Array.isArray(hooks)) {
      throw new SaynaValidationError("hooks must be an array");
    }

    if (hooks.length === 0) {
      throw new SaynaValidationError("hooks array cannot be empty");
    }

    for (const [i, hook] of hooks.entries()) {
      if (
        !hook.host ||
        typeof hook.host !== "string" ||
        hook.host.trim().length === 0
      ) {
        throw new SaynaValidationError(
          `hooks[${i}].host must be a non-empty string`
        );
      }
      if (
        !hook.url ||
        typeof hook.url !== "string" ||
        hook.url.trim().length === 0
      ) {
        throw new SaynaValidationError(
          `hooks[${i}].url must be a non-empty string`
        );
      }
      // auth_id is required but may be an empty string for unauthenticated mode
      if (typeof hook.auth_id !== "string") {
        throw new SaynaValidationError(`hooks[${i}].auth_id must be a string`);
      }
    }

    return this.fetchFromSayna<SipHooksResponse>("sip/hooks", {
      method: "POST",
      body: JSON.stringify({ hooks }),
    });
  }

  /**
   * Deletes SIP webhook hooks by host name from the runtime cache.
   *
   * If a deleted host exists in the original server configuration,
   * it will revert to its config value after deletion.
   *
   * @param hosts - Array of host names to remove (case-insensitive)
   * @returns Promise that resolves with the updated list of hooks after deletion
   * @throws {SaynaValidationError} If hosts array is empty or contains invalid entries
   * @throws {SaynaConnectionError} If the request fails
   * @throws {SaynaServerError} If server returns an error (e.g., 400 for empty hosts, 500 for cache errors)
   *
   * @example
   * ```typescript
   * const response = await client.deleteSipHooks(["example.com", "another.com"]);
   * console.log("Remaining hooks:", response.hooks.length);
   * ```
   */
  async deleteSipHooks(hosts: string[]): Promise<SipHooksResponse> {
    if (!Array.isArray(hosts)) {
      throw new SaynaValidationError("hosts must be an array");
    }

    if (hosts.length === 0) {
      throw new SaynaValidationError("hosts array cannot be empty");
    }

    for (const [i, host] of hosts.entries()) {
      if (!host || typeof host !== "string" || host.trim().length === 0) {
        throw new SaynaValidationError(
          `hosts[${i}] must be a non-empty string`
        );
      }
    }

    return this.fetchFromSayna<SipHooksResponse>("sip/hooks", {
      method: "DELETE",
      body: JSON.stringify({ hosts }),
    });
  }

  /**
   * Whether the client is ready to send/receive data.
   */
  get ready(): boolean {
    return this.isReady;
  }

  /**
   * Whether the client is connected to the WebSocket.
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * LiveKit room name acknowledged by the server, if available.
   */
  get livekitRoomName(): string | undefined {
    return this._livekitRoomName;
  }

  /**
   * LiveKit WebSocket URL configured on the server, if available.
   */
  get livekitUrl(): string | undefined {
    return this._livekitUrl;
  }

  /**
   * Identity assigned to the agent participant when LiveKit is enabled, if available.
   */
  get saynaParticipantIdentity(): string | undefined {
    return this._saynaParticipantIdentity;
  }

  /**
   * Display name assigned to the agent participant when LiveKit is enabled, if available.
   */
  get saynaParticipantName(): string | undefined {
    return this._saynaParticipantName;
  }

  /**
   * Session identifier returned by the server.
   * This can be used to download recordings or correlate session data.
   * The value is available after the connection is ready.
   */
  get streamId(): string | undefined {
    return this._streamId;
  }
}
