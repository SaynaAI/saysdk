import { describe, expect, test } from "bun:test";
import type {
  STTConfig,
  TTSConfig,
  LiveKitConfig,
  ConfigMessage,
  SpeakMessage,
  ClearMessage,
  SendMessageMessage,
  ReadyMessage,
  STTResultMessage,
  ErrorMessage,
  Pronunciation,
  SipTransferMessage,
  SipTransferErrorMessage,
  LiveKitRoomSummary,
  LiveKitRoomsResponse,
  LiveKitParticipantState,
  LiveKitParticipantKind,
  LiveKitParticipantInfo,
  LiveKitRoomDetails,
  RemoveLiveKitParticipantRequest,
  RemoveLiveKitParticipantResponse,
  MuteLiveKitParticipantRequest,
  MuteLiveKitParticipantResponse,
  SipTransferStatus,
  SipTransferRequest,
  SipTransferResponse,
} from "../src/types";

describe("Type Validation", () => {
  test("STTConfig should have correct structure", () => {
    const config: STTConfig = {
      provider: "deepgram",
      language: "en-US",
      sample_rate: 16000,
      channels: 1,
      punctuation: true,
      encoding: "linear16",
      model: "nova-2",
    };

    expect(config.provider).toBe("deepgram");
    expect(config.language).toBe("en-US");
    expect(config.sample_rate).toBe(16000);
  });

  test("TTSConfig should have correct structure", () => {
    const config: TTSConfig = {
      provider: "elevenlabs",
      voice_id: "voice-123",
      speaking_rate: 1.0,
      audio_format: "mp3",
      sample_rate: 24000,
      connection_timeout: 5000,
      request_timeout: 10000,
      model: "eleven_multilingual_v2",
      pronunciations: [],
    };

    expect(config.provider).toBe("elevenlabs");
    expect(config.voice_id).toBe("voice-123");
    expect(config.pronunciations).toEqual([]);
  });

  test("TTSConfig should allow minimal configuration", () => {
    const config: TTSConfig = {
      provider: "deepgram",
      model: "aura-asteria-en",
    };

    expect(config.provider).toBe("deepgram");
    expect(config.model).toBe("aura-asteria-en");
    expect(config.connection_timeout).toBeUndefined();
    expect(config.pronunciations).toBeUndefined();
  });

  test("TTSConfig with pronunciations", () => {
    const pronunciations: Pronunciation[] = [
      { word: "Sayna", pronunciation: "say-nah" },
    ];

    const config: TTSConfig = {
      provider: "elevenlabs",
      voice_id: "voice-123",
      speaking_rate: 1.0,
      audio_format: "mp3",
      sample_rate: 24000,
      connection_timeout: 5000,
      request_timeout: 10000,
      model: "eleven_multilingual_v2",
      pronunciations,
    };

    expect(config.pronunciations?.length).toBe(1);
    expect(config.pronunciations?.[0]?.word).toBe("Sayna");
  });

  test("LiveKitConfig should have correct structure", () => {
    const config: LiveKitConfig = {
      room_name: "test-room",
      enable_recording: true,
    };

    expect(config.room_name).toBe("test-room");
    expect(config.enable_recording).toBe(true);
  });

  test("LiveKitConfig with defaults", () => {
    const config: LiveKitConfig = {
      room_name: "test-room",
    };

    expect(config.room_name).toBe("test-room");
    expect(config.enable_recording).toBeUndefined();
  });
});

describe("Message Types", () => {
  test("ConfigMessage should have correct structure", () => {
    const stt: STTConfig = {
      provider: "deepgram",
      language: "en-US",
      sample_rate: 16000,
      channels: 1,
      punctuation: true,
      encoding: "linear16",
      model: "nova-2",
    };

    const tts: TTSConfig = {
      provider: "elevenlabs",
      voice_id: "voice-123",
      speaking_rate: 1.0,
      audio_format: "mp3",
      sample_rate: 24000,
      connection_timeout: 5000,
      request_timeout: 10000,
      model: "eleven_multilingual_v2",
      pronunciations: [],
    };

    const msg: ConfigMessage = {
      type: "config",
      audio: true,
      stt_config: stt,
      tts_config: tts,
    };

    expect(msg.type).toBe("config");
    expect(msg.audio).toBe(true);
    expect(msg.stt_config?.provider).toBe("deepgram");
  });

  test("SpeakMessage should have correct structure", () => {
    const msg: SpeakMessage = {
      type: "speak",
      text: "Hello world",
      flush: true,
      allow_interruption: false,
    };

    expect(msg.type).toBe("speak");
    expect(msg.text).toBe("Hello world");
    expect(msg.flush).toBe(true);
  });

  test("ClearMessage should have correct structure", () => {
    const msg: ClearMessage = {
      type: "clear",
    };

    expect(msg.type).toBe("clear");
  });

  test("SendMessageMessage should have correct structure", () => {
    const msg: SendMessageMessage = {
      type: "send_message",
      message: "Test message",
      role: "assistant",
      topic: "chat",
      debug: { key: "value" },
    };

    expect(msg.type).toBe("send_message");
    expect(msg.message).toBe("Test message");
    expect(msg.role).toBe("assistant");
  });

  test("ReadyMessage should have correct structure", () => {
    const msg: ReadyMessage = {
      type: "ready",
      livekit_room_name: "test-room",
      livekit_url: "wss://livekit.example.com",
      sayna_participant_identity: "sayna-ai",
      sayna_participant_name: "Sayna AI",
    };

    expect(msg.type).toBe("ready");
    expect(msg.livekit_room_name).toBe("test-room");
    expect(msg.livekit_url).toBe("wss://livekit.example.com");
  });

  test("ReadyMessage should allow missing LiveKit fields when not configured", () => {
    const msg: ReadyMessage = {
      type: "ready",
      stream_id: "stream-123",
    };

    expect(msg.type).toBe("ready");
    expect(msg.livekit_room_name).toBeUndefined();
    expect(msg.livekit_url).toBeUndefined();
    expect(msg.stream_id).toBe("stream-123");
  });

  test("STTResultMessage should have correct structure", () => {
    const msg: STTResultMessage = {
      type: "stt_result",
      transcript: "Hello world",
      is_final: true,
      is_speech_final: true,
      confidence: 0.95,
    };

    expect(msg.type).toBe("stt_result");
    expect(msg.transcript).toBe("Hello world");
    expect(msg.confidence).toBe(0.95);
  });

  test("ErrorMessage should have correct structure", () => {
    const msg: ErrorMessage = {
      type: "error",
      message: "Something went wrong",
    };

    expect(msg.type).toBe("error");
    expect(msg.message).toBe("Something went wrong");
  });

  test("SipTransferMessage should have correct structure", () => {
    const msg: SipTransferMessage = {
      type: "sip_transfer",
      transfer_to: "+1234567890",
    };

    expect(msg.type).toBe("sip_transfer");
    expect(msg.transfer_to).toBe("+1234567890");
  });

  test("SipTransferErrorMessage should have correct structure", () => {
    const msg: SipTransferErrorMessage = {
      type: "sip_transfer_error",
      message: "No SIP participant found",
    };

    expect(msg.type).toBe("sip_transfer_error");
    expect(msg.message).toBe("No SIP participant found");
  });

  test("LiveKitRoomSummary should have correct structure", () => {
    const room: LiveKitRoomSummary = {
      name: "project1_conversation-room-123",
      num_participants: 2,
      creation_time: 1703123456,
    };

    expect(room.name).toBe("project1_conversation-room-123");
    expect(room.num_participants).toBe(2);
    expect(room.creation_time).toBe(1703123456);
  });

  test("LiveKitRoomsResponse should have correct structure", () => {
    const response: LiveKitRoomsResponse = {
      rooms: [
        {
          name: "project1_room-1",
          num_participants: 2,
          creation_time: 1703123456,
        },
        {
          name: "project1_room-2",
          num_participants: 0,
          creation_time: 1703123789,
        },
      ],
    };

    expect(response.rooms).toHaveLength(2);
    expect(response.rooms[0]?.name).toBe("project1_room-1");
    expect(response.rooms[1]?.num_participants).toBe(0);
  });

  test("LiveKitRoomsResponse should allow empty rooms array", () => {
    const response: LiveKitRoomsResponse = {
      rooms: [],
    };

    expect(response.rooms).toHaveLength(0);
  });

  test("LiveKitRoomDetails should have correct structure with participants", () => {
    const participantState: LiveKitParticipantState = "ACTIVE";
    const participantKind: LiveKitParticipantKind = "STANDARD";

    const participant: LiveKitParticipantInfo = {
      sid: "PA_abc123",
      identity: "user-alice-456",
      name: "Alice Smith",
      state: participantState,
      kind: participantKind,
      joined_at: 1703123456,
      metadata: '{"role": "host"}',
      attributes: { department: "engineering" },
      is_publisher: true,
    };

    const roomDetails: LiveKitRoomDetails = {
      sid: "RM_xyz789",
      name: "project1_conversation-room-123",
      num_participants: 2,
      max_participants: 10,
      creation_time: 1703123456,
      metadata: "",
      active_recording: false,
      participants: [participant],
    };

    expect(roomDetails.sid).toBe("RM_xyz789");
    expect(roomDetails.name).toBe("project1_conversation-room-123");
    expect(roomDetails.num_participants).toBe(2);
    expect(roomDetails.max_participants).toBe(10);
    expect(roomDetails.creation_time).toBe(1703123456);
    expect(roomDetails.metadata).toBe("");
    expect(roomDetails.active_recording).toBe(false);
    expect(roomDetails.participants).toHaveLength(1);
    expect(roomDetails.participants[0]?.sid).toBe("PA_abc123");
    expect(roomDetails.participants[0]?.identity).toBe("user-alice-456");
    expect(roomDetails.participants[0]?.name).toBe("Alice Smith");
    expect(roomDetails.participants[0]?.state).toBe("ACTIVE");
    expect(roomDetails.participants[0]?.kind).toBe("STANDARD");
    expect(roomDetails.participants[0]?.is_publisher).toBe(true);
  });

  test("LiveKitRoomDetails should allow empty participants array", () => {
    const roomDetails: LiveKitRoomDetails = {
      sid: "RM_empty123",
      name: "project1_empty-room",
      num_participants: 0,
      max_participants: 0,
      creation_time: 1703123456,
      metadata: "",
      active_recording: false,
      participants: [],
    };

    expect(roomDetails.participants).toHaveLength(0);
    expect(roomDetails.max_participants).toBe(0);
  });

  test("LiveKitParticipantInfo should support all participant kinds", () => {
    const kinds: LiveKitParticipantKind[] = [
      "STANDARD",
      "AGENT",
      "SIP",
      "EGRESS",
      "INGRESS",
      "UNKNOWN",
    ];

    for (const kind of kinds) {
      const participant: LiveKitParticipantInfo = {
        sid: "PA_test",
        identity: "test-user",
        name: "Test User",
        state: "ACTIVE",
        kind: kind,
        joined_at: 1703123456,
        metadata: "",
        attributes: {},
        is_publisher: false,
      };
      expect(participant.kind).toBe(kind);
    }
  });

  test("LiveKitParticipantInfo should support all participant states", () => {
    const states: LiveKitParticipantState[] = [
      "JOINING",
      "JOINED",
      "ACTIVE",
      "DISCONNECTED",
      "UNKNOWN",
    ];

    for (const state of states) {
      const participant: LiveKitParticipantInfo = {
        sid: "PA_test",
        identity: "test-user",
        name: "Test User",
        state: state,
        kind: "STANDARD",
        joined_at: 1703123456,
        metadata: "",
        attributes: {},
        is_publisher: false,
      };
      expect(participant.state).toBe(state);
    }
  });

  test("RemoveLiveKitParticipantRequest should have correct structure", () => {
    const request: RemoveLiveKitParticipantRequest = {
      room_name: "conversation-room-123",
      participant_identity: "user-alice-456",
    };

    expect(request.room_name).toBe("conversation-room-123");
    expect(request.participant_identity).toBe("user-alice-456");
  });

  test("RemoveLiveKitParticipantResponse should have correct structure", () => {
    const response: RemoveLiveKitParticipantResponse = {
      status: "removed",
      room_name: "project1_conversation-room-123",
      participant_identity: "user-alice-456",
    };

    expect(response.status).toBe("removed");
    expect(response.room_name).toBe("project1_conversation-room-123");
    expect(response.participant_identity).toBe("user-alice-456");
  });

  test("MuteLiveKitParticipantRequest should have correct structure", () => {
    const request: MuteLiveKitParticipantRequest = {
      room_name: "conversation-room-123",
      participant_identity: "user-alice-456",
      track_sid: "TR_abc123",
      muted: true,
    };

    expect(request.room_name).toBe("conversation-room-123");
    expect(request.participant_identity).toBe("user-alice-456");
    expect(request.track_sid).toBe("TR_abc123");
    expect(request.muted).toBe(true);
  });

  test("MuteLiveKitParticipantRequest should support unmute (muted: false)", () => {
    const request: MuteLiveKitParticipantRequest = {
      room_name: "conversation-room-123",
      participant_identity: "user-alice-456",
      track_sid: "TR_abc123",
      muted: false,
    };

    expect(request.muted).toBe(false);
  });

  test("MuteLiveKitParticipantResponse should have correct structure", () => {
    const response: MuteLiveKitParticipantResponse = {
      room_name: "project1_conversation-room-123",
      participant_identity: "user-alice-456",
      track_sid: "TR_abc123",
      muted: true,
    };

    expect(response.room_name).toBe("project1_conversation-room-123");
    expect(response.participant_identity).toBe("user-alice-456");
    expect(response.track_sid).toBe("TR_abc123");
    expect(response.muted).toBe(true);
  });

  test("MuteLiveKitParticipantResponse should echo muted state correctly", () => {
    const mutedResponse: MuteLiveKitParticipantResponse = {
      room_name: "project1_room",
      participant_identity: "user-123",
      track_sid: "TR_xyz",
      muted: true,
    };

    const unmutedResponse: MuteLiveKitParticipantResponse = {
      room_name: "project1_room",
      participant_identity: "user-123",
      track_sid: "TR_xyz",
      muted: false,
    };

    expect(mutedResponse.muted).toBe(true);
    expect(unmutedResponse.muted).toBe(false);
  });

  test("SipTransferStatus should support 'initiated' and 'completed' values", () => {
    const initiatedStatus: SipTransferStatus = "initiated";
    const completedStatus: SipTransferStatus = "completed";

    expect(initiatedStatus).toBe("initiated");
    expect(completedStatus).toBe("completed");
  });

  test("SipTransferRequest should have correct structure", () => {
    const request: SipTransferRequest = {
      room_name: "call-room-123",
      participant_identity: "sip_participant_456",
      transfer_to: "+15551234567",
    };

    expect(request.room_name).toBe("call-room-123");
    expect(request.participant_identity).toBe("sip_participant_456");
    expect(request.transfer_to).toBe("+15551234567");
  });

  test("SipTransferRequest should support different phone formats", () => {
    // International format
    const intlRequest: SipTransferRequest = {
      room_name: "room-1",
      participant_identity: "sip-user",
      transfer_to: "+15551234567",
    };
    expect(intlRequest.transfer_to).toBe("+15551234567");

    // National format
    const nationalRequest: SipTransferRequest = {
      room_name: "room-1",
      participant_identity: "sip-user",
      transfer_to: "07123456789",
    };
    expect(nationalRequest.transfer_to).toBe("07123456789");

    // Extension format
    const extensionRequest: SipTransferRequest = {
      room_name: "room-1",
      participant_identity: "sip-user",
      transfer_to: "1234",
    };
    expect(extensionRequest.transfer_to).toBe("1234");
  });

  test("SipTransferResponse should have correct structure with 'initiated' status", () => {
    const response: SipTransferResponse = {
      status: "initiated",
      room_name: "project1_call-room-123",
      participant_identity: "sip_participant_456",
      transfer_to: "tel:+15551234567",
    };

    expect(response.status).toBe("initiated");
    expect(response.room_name).toBe("project1_call-room-123");
    expect(response.participant_identity).toBe("sip_participant_456");
    expect(response.transfer_to).toBe("tel:+15551234567");
  });

  test("SipTransferResponse should have correct structure with 'completed' status", () => {
    const response: SipTransferResponse = {
      status: "completed",
      room_name: "project1_call-room-123",
      participant_identity: "sip_participant_456",
      transfer_to: "tel:+15551234567",
    };

    expect(response.status).toBe("completed");
    expect(response.room_name).toBe("project1_call-room-123");
    expect(response.participant_identity).toBe("sip_participant_456");
    expect(response.transfer_to).toBe("tel:+15551234567");
  });

  test("SipTransferResponse should include tel: prefix in transfer_to", () => {
    const response: SipTransferResponse = {
      status: "completed",
      room_name: "project1_room",
      participant_identity: "sip-user",
      transfer_to: "tel:+15551234567",
    };

    expect(response.transfer_to.startsWith("tel:")).toBe(true);
  });
});
