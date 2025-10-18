import { ConnectionState, Room, RoomEvent } from "livekit-client";
import type {
  AudioCaptureOptions,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
} from "livekit-client";

/**
 * Token payload returned by Sayna's API.
 * Must include the access token and the room URL (liveUrl).
 */
export interface TokenResponse {
  token: string;
  liveUrl: string;
  [key: string]: unknown;
}

export interface SaynaClientOptions {
  tokenUrl: string | URL;
  audioElement?: HTMLAudioElement;
  enableAudioPlayback?: boolean;
}

/**
 * SaynaClient wraps LiveKit client logic for browser usage.
 */
export class SaynaClient {
  private room: Room | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly enableAudioPlayback: boolean;
  private isConnecting = false;
  private audioElement: HTMLAudioElement | null;
  private createdAudioElement = false;
  private readonly attachedAudioTracks = new Set<RemoteTrack>();

  private readonly handleTrackSubscribed = (
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant
  ) => {
    if (!this.enableAudioPlayback || track.kind !== "audio") {
      return;
    }

    const element = this.ensureAudioElement();
    if (!element) {
      return;
    }

    track.attach(element);
    this.attachedAudioTracks.add(track);
  };

  private readonly handleTrackUnsubscribed = (track: RemoteTrack) => {
    if (track.kind === "audio" && this.attachedAudioTracks.has(track)) {
      track.detach();
      this.attachedAudioTracks.delete(track);
    }
  };

  private readonly handleRoomDisconnected = () => {
    this.detachAllTracks();
    this.room = null;
    this.isConnecting = false;
  };

  constructor(private readonly options: SaynaClientOptions) {
    if (!options.tokenUrl) {
      throw new Error("SaynaClient requires a tokenUrl.");
    }

    const fetchImpl =
      typeof fetch !== "undefined" ? fetch.bind(globalThis) : undefined;

    if (!fetchImpl) {
      throw new Error(
        "Fetch API is not available in this environment. Provide fetchImplementation in SaynaClientOptions."
      );
    }

    this.fetchImpl = fetchImpl;
    this.enableAudioPlayback = options.enableAudioPlayback ?? true;
    this.audioElement = options.audioElement ?? null;
  }

  /**
   * Returns the underlying LiveKit room instance if connected.
   */
  public get currentRoom(): Room | null {
    return this.room;
  }

  /**
   * Returns true when the client is connected to LiveKit.
   */
  public get isConnected(): boolean {
    return this.room?.state === ConnectionState.Connected;
  }

  /**
   * Returns the HTMLAudioElement used for remote playback, if any.
   */
  public get playbackElement(): HTMLAudioElement | null {
    return this.audioElement;
  }

  /**
   * Fetches a token (if needed), connects to LiveKit and resolves to the Room instance.
   */
  public async connect(): Promise<Room> {
    this.assertBrowserEnvironment();

    if (this.isConnecting) {
      throw new Error("SaynaClient: connect() is already in progress.");
    }

    if (this.isConnected) {
      throw new Error("SaynaClient: already connected to a room.");
    }

    this.isConnecting = true;

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });
    this.room = room;

    room.on(RoomEvent.TrackSubscribed, this.handleTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, this.handleTrackUnsubscribed);
    room.on(RoomEvent.Disconnected, this.handleRoomDisconnected);

    try {
      const tokenResponse = await this.resolveToken();

      if (this.enableAudioPlayback) {
        this.ensureAudioElement();
      }

      await room.connect(
        tokenResponse.liveUrl
          .replace("http://", "ws://")
          .replace("https://", "wss://"),
        tokenResponse.token,
        {
          autoSubscribe: true,
        }
      );
      return room;
    } catch (error) {
      await this.safeDisconnect(room);
      this.detachAllTracks();
      this.room = null;
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Enables the microphone and publishes audio track to the room.
   */
  public async publishMicrophone(options?: AudioCaptureOptions): Promise<void> {
    const room = this.requireConnectedRoom("publishMicrophone");
    await room.localParticipant.setMicrophoneEnabled(true, options);
  }

  /**
   * Disconnects from the room and cleans up local resources.
   */
  public async disconnect(): Promise<void> {
    if (!this.room) {
      return;
    }

    const room = this.room;
    this.room = null;

    room.off(RoomEvent.TrackSubscribed, this.handleTrackSubscribed);
    room.off(RoomEvent.TrackUnsubscribed, this.handleTrackUnsubscribed);
    room.off(RoomEvent.Disconnected, this.handleRoomDisconnected);

    this.detachAllTracks();

    if (room.state !== ConnectionState.Disconnected) {
      await room.disconnect();
    }
  }

  private async resolveToken(): Promise<TokenResponse> {
    const requestUrl = this.toAbsoluteUrl(this.options.tokenUrl);

    const response = await this.fetchImpl(requestUrl.toString(), {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(
        `SaynaClient: token request failed with status ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as TokenResponse;
    if (!data || typeof data !== "object") {
      throw new Error("SaynaClient: token response is not a valid object.");
    }

    if (!("token" in data) || typeof data.token !== "string") {
      throw new Error("SaynaClient: token response is missing a token string.");
    }

    if (!("liveUrl" in data) || typeof data.liveUrl !== "string") {
      throw new Error(
        "SaynaClient: token response is missing a liveUrl string."
      );
    }

    return data;
  }

  private ensureAudioElement(): HTMLAudioElement | null {
    if (!this.enableAudioPlayback) {
      return null;
    }

    if (!this.audioElement) {
      if (typeof document !== "undefined" && document.createElement) {
        this.audioElement = document.createElement("audio");
        this.audioElement.autoplay = true;
        this.createdAudioElement = true;
      } else if (typeof Audio !== "undefined") {
        this.audioElement = new Audio();
        this.audioElement.autoplay = true;
        this.createdAudioElement = true;
      } else {
        return null;
      }
    }

    return this.audioElement;
  }

  private detachAllTracks(): void {
    for (const track of this.attachedAudioTracks) {
      track.detach();
    }
    this.attachedAudioTracks.clear();

    if (this.createdAudioElement && this.audioElement) {
      this.audioElement.srcObject = null;
    }
  }

  private async safeDisconnect(room: Room): Promise<void> {
    try {
      if (room.state !== ConnectionState.Disconnected) {
        await room.disconnect();
      }
    } catch {
      // Ignore disconnect errors during cleanup
    } finally {
      room.off(RoomEvent.TrackSubscribed, this.handleTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, this.handleTrackUnsubscribed);
      room.off(RoomEvent.Disconnected, this.handleRoomDisconnected);
    }
  }

  private requireConnectedRoom(methodName: string): Room {
    if (!this.room || this.room.state !== ConnectionState.Connected) {
      throw new Error(
        `SaynaClient: cannot call ${methodName} before connect().`
      );
    }
    return this.room;
  }

  private toAbsoluteUrl(tokenUrl: string | URL): URL {
    if (tokenUrl instanceof URL) {
      return new URL(tokenUrl.toString());
    }

    try {
      return new URL(tokenUrl);
    } catch {
      if (typeof window === "undefined" || !window.location) {
        throw new Error(
          "SaynaClient: relative tokenUrl requires a browser environment."
        );
      }
      return new URL(tokenUrl, window.location.href);
    }
  }

  private assertBrowserEnvironment(): void {
    if (typeof window === "undefined" || typeof document === "undefined") {
      throw new Error("SaynaClient runs in browser environments only.");
    }
  }
}
