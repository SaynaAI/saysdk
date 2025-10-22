import { SaynaClient } from "@sayna-ai/js-sdk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useRef, useState, type FormEvent } from "react";

export function APITester() {
  const [saynaUrl, setSaynaUrl] = useState("");
  const [roomName, setRoomName] = useState("");
  const [participantName, setParticipantName] = useState("");
  const [status, setStatus] = useState("Disconnected");
  const [tokenResponse, setTokenResponse] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const clientRef = useRef<SaynaClient | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const generatedRoomRef = useRef<string | null>(null);

  const disconnect = async () => {
    const existing = clientRef.current;
    clientRef.current = null;

    if (!existing) {
      setStatus("Disconnected");
      return;
    }

    try {
      await existing.disconnect();
    } catch (error) {
      console.error("Failed to disconnect Sayna client:", error);
    } finally {
      setStatus("Disconnected");
    }
  };

  useEffect(() => {
    return () => {
      void disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (isConnecting || clientRef.current?.isConnected) {
      return;
    }

    setIsConnecting(true);
    setErrorMessage(null);

    try {
      const trimmedUrl = saynaUrl.trim();
      if (!trimmedUrl) {
        throw new Error("Please provide a Sayna URL.");
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(trimmedUrl);
      } catch {
        throw new Error("Sayna URL must be a valid absolute URL.");
      }

      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Sayna URL must use http or https.");
      }

      const submittedRoom = roomName.trim();
      const resolvedRoom =
        submittedRoom.length > 0
          ? submittedRoom
          : generatedRoomRef.current ?? `ui-room-${crypto.randomUUID()}`;

      if (!submittedRoom) {
        generatedRoomRef.current = resolvedRoom;
        setRoomName(resolvedRoom);
      }

      setStatus("Requesting access token...");

      setStatus("Connecting to LiveKit...");

      const client = new SaynaClient({
        tokenFetchHandler: async () => {
          const tokenUrl = new URL("/sayna/token", window.location.origin);

          // Add participant name if provided
          const trimmedParticipantName = participantName.trim();

          const tokenRes = await fetch(tokenUrl.toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              saynaUrl: parsedUrl.toString(),
              room: resolvedRoom,
              participantName: trimmedParticipantName ?? 'Web User',
              participantIdentity: `user-${crypto.randomUUID()}`,
            }),
          });
          const tokenJson = await tokenRes.json();
          setTokenResponse(JSON.stringify(tokenJson, null, 2));

          if (!tokenRes.ok) {
            const errorText =
              typeof tokenJson?.error === "string"
                ? tokenJson.error
                : tokenRes.statusText;
            throw new Error(
              errorText || "Failed to retrieve token from server."
            );
          }

          return tokenJson;
        },
        audioElement: audioRef.current ?? undefined,
        enableAudioPlayback: true,
      });
      clientRef.current = client;

      const room = await client.connect();
      const resolvedRoomName = room.name || resolvedRoom;

      setStatus(`Connected to ${resolvedRoomName}. Publishing microphone...`);

      try {
        await client.publishMicrophone();
        setStatus(`Connected to ${resolvedRoomName}. Microphone is live.`);
      } catch (microphoneError) {
        console.warn("Failed to enable microphone:", microphoneError);
        setStatus(
          `Connected to ${resolvedRoomName}, but microphone access was not granted.`
        );
        setErrorMessage(
          microphoneError instanceof Error
            ? microphoneError.message
            : String(microphoneError)
        );
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      await disconnect();
      setStatus("Connection failed.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectClick = async () => {
    await disconnect();
  };

  const isConnected = Boolean(clientRef.current?.isConnected);

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleConnect} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sayna-url">Sayna URL</Label>
            <Input
              id="sayna-url"
              type="url"
              placeholder="https://dev-api.sayna.ai"
              value={saynaUrl}
              onChange={(event) => setSaynaUrl(event.target.value)}
              required
              disabled={isConnecting || isConnected}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="participant-name">Your Name</Label>
            <Input
              id="participant-name"
              type="text"
              placeholder="Web User (optional)"
              value={participantName}
              onChange={(event) => setParticipantName(event.target.value)}
              disabled={isConnecting || isConnected}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto] items-end">
          <div className="flex flex-col gap-2">
            <Label htmlFor="room-name">Room name</Label>
            <Input
              id="room-name"
              type="text"
              placeholder="Autogenerated if empty"
              value={roomName}
              onChange={(event) => setRoomName(event.target.value)}
              disabled={isConnecting || isConnected}
            />
          </div>

          {!isConnected ? (
            <Button type="submit" variant="secondary" disabled={isConnecting}>
              {isConnecting ? "Connecting..." : "Connect"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="destructive"
              onClick={handleDisconnectClick}
            >
              Disconnect
            </Button>
          )}
        </div>
      </form>

      <div className="space-y-2">
        <Label>Status</Label>
        <Textarea
          readOnly
          value={status}
          className="min-h-[80px] font-mono resize-y"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="token-response">Token response</Label>
        <Textarea
          id="token-response"
          readOnly
          value={tokenResponse}
          placeholder="Token response will appear here once retrieved."
          className="min-h-[160px] font-mono resize-y"
        />
      </div>

      {errorMessage && (
        <div className="text-sm text-destructive font-mono border border-destructive rounded-md p-3 bg-destructive/10">
          {errorMessage}
        </div>
      )}

      <div className="space-y-2">
        <Label>Remote audio</Label>
        <audio ref={audioRef} autoPlay controls className="w-full" />
      </div>
    </div>
  );
}
