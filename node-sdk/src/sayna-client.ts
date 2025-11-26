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
  OutgoingMessage,
  SaynaMessage,
  Participant,
  VoicesResponse,
  HealthResponse,
  LiveKitTokenResponse,
  SipHook,
  SipHooksResponse,
} from "./types";
import {
  SaynaNotConnectedError,
  SaynaNotReadyError,
  SaynaConnectionError,
  SaynaValidationError,
  SaynaServerError,
} from "./errors";

// Node.js 18+ has native fetch support
declare const fetch: typeof globalThis.fetch;

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
 * Event handler for TTS playback completion.
 */
export type TTSPlaybackCompleteHandler = (
  timestamp: number
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
  private websocket?: WebSocket;
  private isConnected: boolean = false;
  private isReady: boolean = false;
  private _livekitRoomName?: string;
  private _livekitUrl?: string;
  private _saynaParticipantIdentity?: string;
  private _saynaParticipantName?: string;
  private sttCallback?: STTResultHandler;
  private ttsCallback?: TTSAudioHandler;
  private errorCallback?: ErrorHandler;
  private messageCallback?: MessageHandler;
  private participantDisconnectedCallback?: ParticipantDisconnectedHandler;
  private ttsPlaybackCompleteCallback?: TTSPlaybackCompleteHandler;
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
   *
   * @throws {SaynaValidationError} If URL is invalid or if audio configs are missing when audio is enabled
   */
  constructor(
    url: string,
    sttConfig?: STTConfig,
    ttsConfig?: TTSConfig,
    livekitConfig?: LiveKitConfig,
    withoutAudio: boolean = false,
    apiKey?: string
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

    // Convert HTTP(S) URL to WebSocket URL
    const wsUrl =
      this.url.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://") +
      (this.url.endsWith("/") ? "ws" : "/ws");

    return new Promise((resolve, reject) => {
      this.readyPromiseResolve = resolve;
      this.readyPromiseReject = reject;

      try {
        const headers = this.apiKey
          ? { Authorization: `Bearer ${this.apiKey}` }
          : undefined;

        const WebSocketConstructor = WebSocket as unknown as {
          new (
            url: string,
            protocols?: string | string[],
            options?: { headers?: Record<string, string> }
          ): WebSocket;
        };

        this.websocket = headers
          ? new WebSocketConstructor(wsUrl, undefined, { headers })
          : new WebSocket(wsUrl);

        this.websocket.onopen = () => {
          this.isConnected = true;

          // Send initial configuration
          const configMessage: ConfigMessage = {
            type: "config",
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

        this.websocket.onmessage = async (event) => {
          try {
            if (
              event.data instanceof Blob ||
              event.data instanceof ArrayBuffer
            ) {
              // Binary TTS audio data
              const buffer =
                event.data instanceof Blob
                  ? await event.data.arrayBuffer()
                  : event.data;
              if (this.ttsCallback) {
                await this.ttsCallback(buffer);
              }
            } else {
              // JSON control messages
              if (typeof event.data !== "string") {
                throw new Error("Expected string data for JSON messages");
              }
              const data = JSON.parse(event.data) as OutgoingMessage;
              await this.handleJsonMessage(data);
            }
          } catch (error) {
            // Log parse errors but don't break the connection
            if (this.errorCallback) {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              await this.errorCallback({
                type: "error",
                message: `Failed to process message: ${errorMessage}`,
              });
            }
          }
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
            this.readyPromiseReject(
              new SaynaConnectionError(
                `WebSocket closed before ready (code: ${event.code}, reason: ${event.reason || "none"})`
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
   * Handles incoming JSON messages from the WebSocket.
   * @internal
   */
  private async handleJsonMessage(data: OutgoingMessage): Promise<void> {
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
          if (this.readyPromiseResolve) {
            this.readyPromiseResolve();
          }
          break;
        }

        case "stt_result": {
          const sttResult = data;
          if (this.sttCallback) {
            await this.sttCallback(sttResult);
          }
          break;
        }

        case "error": {
          const errorMsg = data;
          if (this.errorCallback) {
            await this.errorCallback(errorMsg);
          }
          if (this.readyPromiseReject && !this.isReady) {
            this.readyPromiseReject(new SaynaServerError(errorMsg.message));
          }
          break;
        }

        case "message": {
          const messageData = data;
          if (this.messageCallback) {
            await this.messageCallback(messageData.message);
          }
          break;
        }

        case "participant_disconnected": {
          const participantMsg = data;
          if (this.participantDisconnectedCallback) {
            await this.participantDisconnectedCallback(
              participantMsg.participant
            );
          }
          break;
        }

        case "tts_playback_complete": {
          const ttsPlaybackCompleteMsg = data;
          if (this.ttsPlaybackCompleteCallback) {
            await this.ttsPlaybackCompleteCallback(
              ttsPlaybackCompleteMsg.timestamp
            );
          }
          break;
        }
      }
    } catch (error) {
      // Notify error callback if handler fails
      if (this.errorCallback) {
        await this.errorCallback({
          type: "error",
          message: `Handler error: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
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
   * @throws {SaynaServerError} If the server returns an error response
   */
  private async fetchFromSayna<T>(
    endpoint: string,
    options: RequestInit = {},
    responseType: "json" | "arrayBuffer" = "json"
  ): Promise<T> {
    const httpUrl = this.getHttpUrl();
    const url = `${httpUrl}${httpUrl.endsWith("/") ? "" : "/"}${endpoint.startsWith("/") ? endpoint.slice(1) : endpoint}`;

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

    // Add Content-Type for JSON requests if not already set
    if (options.method === "POST" && options.body && !headers["Content-Type"]) {
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
        throw new SaynaServerError(errorMessage);
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

      if (this.websocket.readyState === WebSocket.OPEN) {
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
   * Registers a callback for TTS playback completion.
   *
   * @param callback - Function to call when TTS playback is complete
   */
  registerOnTtsPlaybackComplete(callback: TTSPlaybackCompleteHandler): void {
    this.ttsPlaybackCompleteCallback = callback;
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
   * @param roomName - LiveKit room to join or create
   * @param participantName - Display name assigned to the participant
   * @param participantIdentity - Unique identifier for the participant
   * @returns Promise that resolves with the LiveKit token and connection details
   * @throws {SaynaValidationError} If any parameter is empty
   * @throws {SaynaConnectionError} If the request fails
   * @throws {SaynaServerError} If server returns an error
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
   *   { host: "example.com", url: "https://webhook.example.com/events" },
   *   { host: "another.com", url: "https://webhook.another.com/events" }
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
      if (!hook || !hook.host || typeof hook.host !== "string" || hook.host.trim().length === 0) {
        throw new SaynaValidationError(`hooks[${i}].host must be a non-empty string`);
      }
      if (!hook.url || typeof hook.url !== "string" || hook.url.trim().length === 0) {
        throw new SaynaValidationError(`hooks[${i}].url must be a non-empty string`);
      }
    }

    return this.fetchFromSayna<SipHooksResponse>("sip/hooks", {
      method: "POST",
      body: JSON.stringify({ hooks }),
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
}
