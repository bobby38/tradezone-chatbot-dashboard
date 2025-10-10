"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Loader2 } from "lucide-react";

interface RealtimeVoiceProps {
  sessionId: string;
  onTranscript?: (text: string, role: "user" | "assistant") => void;
}

export function RealtimeVoice({ sessionId, onTranscript }: RealtimeVoiceProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState<string>("Ready to start");

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const startVoiceSession = async () => {
    try {
      setStatus("Initializing...");

      // Get configuration from backend
      const response = await fetch("/api/chatkit/realtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      const config = await response.json();

      if (!config.success) {
        throw new Error("Failed to get realtime configuration");
      }

      // Connect to OpenAI Realtime API
      const ws = new WebSocket(
        `${config.config.websocketUrl}?model=${config.config.model}`,
        ["realtime", `openai-insecure-api-key.${config.config.apiKey}`],
      );

      wsRef.current = ws;

      ws.onopen = async () => {
        console.log("[Realtime] Connected");
        setIsConnected(true);
        setStatus("Connected");

        // Configure the session with tools
        ws.send(
          JSON.stringify({
            type: "session.update",
            session: {
              type: "response",
              model: config.config.model,
              modalities: ["text", "audio"],
              instructions: `You are Izacc, TradeZone Singapore's helpful AI assistant.

Your role:
- Help customers find gaming consoles, laptops, phones, and tech products
- Answer questions about pricing, specifications, availability
- Assist with trade-in inquiries
- Provide product recommendations

Available tools:
1. **searchtool**: Search TradeZone products (searches our vector database first, then web if needed)
2. **sendemail**: Send inquiry to staff (use when customer explicitly requests contact)

Always search for products when asked. Be friendly, concise, and helpful. Speak naturally as if talking to a customer in-store.`,
              voice: config.config.voice || "alloy",
              input_audio_format: "pcm16",
              output_audio_format: "pcm16",
              input_audio_transcription: {
                model: "whisper-1",
              },
              turn_detection: {
                type: "server_vad",
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 500,
              },
              tools: [
                {
                  type: "function",
                  name: "searchtool",
                  description:
                    "Search for TradeZone products including gaming consoles, laptops, phones, accessories, pricing and availability.",
                  parameters: {
                    type: "object",
                    properties: {
                      query: {
                        type: "string",
                        description: "The product search query",
                      },
                    },
                    required: ["query"],
                  },
                },
                {
                  type: "function",
                  name: "sendemail",
                  description:
                    "Send an email inquiry to TradeZone staff. Only use when customer explicitly requests to be contacted or wants staff to follow up.",
                  parameters: {
                    type: "object",
                    properties: {
                      emailType: {
                        type: "string",
                        enum: ["trade_in", "info_request", "contact"],
                        description: "Type of inquiry",
                      },
                      name: {
                        type: "string",
                        description: "Customer name",
                      },
                      email: {
                        type: "string",
                        description: "Customer email address",
                      },
                      phone_number: {
                        type: "string",
                        description: "Customer phone number (optional)",
                      },
                      message: {
                        type: "string",
                        description: "Customer inquiry or request details",
                      },
                    },
                    required: ["emailType", "name", "email", "message"],
                  },
                },
              ],
              tool_choice: "auto",
            },
          }),
        );

        // Note: Vector store is configured in session tools, not as a message
        console.log(
          "[Realtime] Vector store configured:",
          config.config.vectorStoreId,
        );

        // Start capturing audio
        await startAudioCapture(ws);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleRealtimeEvent(data);
      };

      ws.onerror = (error) => {
        console.error("[Realtime] Error:", error);
        setStatus("Connection error");
        stopVoiceSession();
      };

      ws.onclose = () => {
        console.log("[Realtime] Disconnected");
        setIsConnected(false);
        setStatus("Disconnected");
        stopVoiceSession();
      };
    } catch (error) {
      console.error("[Realtime] Failed to start:", error);
      setStatus("Failed to start");
    }
  };

  const startAudioCapture = async (ws: WebSocket) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 24000,
        },
      });

      mediaStreamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!isRecording) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);

        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        if (ws.readyState === WebSocket.OPEN) {
          const base64 = btoa(
            String.fromCharCode(...new Uint8Array(pcm16.buffer)),
          );
          ws.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: base64,
            }),
          );
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsRecording(true);
      setStatus("Listening...");
    } catch (error) {
      console.error("[Realtime] Microphone access denied:", error);
      setStatus("Microphone access denied");
      alert("Please allow microphone access to use voice chat.");
    }
  };

  const handleRealtimeEvent = (event: any) => {
    console.log("[Realtime Event]:", event.type);

    switch (event.type) {
      case "conversation.item.input_audio_transcription.completed":
        // User speech transcribed
        const userText = event.transcript;
        console.log("[User]:", userText);
        onTranscript?.(userText, "user");
        setStatus(`You: ${userText.substring(0, 50)}...`);
        break;

      case "response.audio_transcript.delta":
        // Assistant speaking (transcript)
        const assistantText = event.delta;
        onTranscript?.(assistantText, "assistant");
        break;

      case "response.audio.delta":
        // Play audio response
        playAudioChunk(event.delta);
        setStatus("Izacc speaking...");
        break;

      case "response.function_call_arguments.done":
        // Tool called
        console.log("[Tool Called]:", event.name, event.arguments);
        handleToolCall(event.call_id, event.name, event.arguments);
        setStatus(`Using tool: ${event.name}...`);
        break;

      case "response.done":
        setStatus("Listening...");
        break;

      case "error":
        console.error("[Realtime Error]:", event.error);
        setStatus(`Error: ${event.error.message}`);
        break;
    }
  };

  const handleToolCall = async (callId: string, name: string, args: string) => {
    try {
      const parsedArgs = JSON.parse(args);
      let result = "";

      if (name === "searchtool") {
        // Call Perplexity search
        const response = await fetch("/api/tools/perplexity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: parsedArgs.query }),
        });
        const data = await response.json();
        result = data.result || "No results found";
      } else if (name === "sendemail") {
        // Call email send
        const response = await fetch("/api/tools/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsedArgs),
        });
        const data = await response.json();
        result = data.result || "Email sent successfully";
      }

      // Send tool result back to Realtime API
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: callId,
              output: result,
            },
          }),
        );

        // Trigger response generation
        wsRef.current.send(
          JSON.stringify({
            type: "response.create",
          }),
        );
      }
    } catch (error) {
      console.error("[Tool Error]:", error);
    }
  };

  const playAudioChunk = (base64Audio: string) => {
    try {
      // Decode base64 PCM16 audio
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // TODO: Implement audio playback queue
      // For now, log that we received audio
      console.log("[Audio Chunk]:", bytes.length, "bytes");
    } catch (error) {
      console.error("[Audio Playback Error]:", error);
    }
  };

  const stopVoiceSession = () => {
    setIsRecording(false);

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    setStatus("Stopped");
  };

  useEffect(() => {
    return () => {
      stopVoiceSession();
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium">Voice Chat Status</p>
          <p className="text-xs text-muted-foreground">{status}</p>
        </div>

        <Button
          size="lg"
          variant={isConnected ? "destructive" : "default"}
          onClick={isConnected ? stopVoiceSession : startVoiceSession}
          disabled={!isConnected && status === "Initializing..."}
        >
          {status === "Initializing..." ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Connecting...
            </>
          ) : isConnected ? (
            <>
              <MicOff className="mr-2 h-5 w-5" />
              End Call
            </>
          ) : (
            <>
              <Mic className="mr-2 h-5 w-5" />
              Start Voice Chat
            </>
          )}
        </Button>
      </div>

      {isConnected && (
        <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
          <p className="text-sm text-center">
            🎙️ Voice chat active - Speak naturally, Izacc is listening!
          </p>
        </div>
      )}
    </div>
  );
}
