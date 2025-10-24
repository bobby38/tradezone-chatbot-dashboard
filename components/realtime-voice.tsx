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
  const playbackContextRef = useRef<AudioContext | null>(null);
  const playbackNodeRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isRespondingRef = useRef(false);

  const startVoiceSession = async () => {
    try {
      setStatus("Initializing...");

      // Ensure playback AudioContext is created while we're still in a user gesture
      initializePlayback();

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

      // Connect to OpenAI Realtime API with proper headers
      const ws = new WebSocket(
        `${config.config.websocketUrl}?model=${config.config.model}`,
        [
          "realtime",
          `openai-insecure-api-key.${config.config.apiKey}`,
          "openai-beta.realtime-v1",
        ],
      );

      wsRef.current = ws;

      ws.onopen = async () => {
        console.log("[Realtime] Connected");
        setIsConnected(true);
        setStatus("Connected");

        const sessionConfig = config.config.sessionConfig || {};
        const sessionPayload = {
          ...sessionConfig,
          modalities: sessionConfig.modalities || ["text", "audio"],
          voice: sessionConfig.voice || config.config.voice || "verse",
          output_audio_format: sessionConfig.output_audio_format || "pcm16",
          instructions:
            sessionConfig.instructions ||
            "You are Amara, TradeZone.sg's voice assistant. Keep answers short (1-2 sentences) and pause to let the caller respond.",
          tools: sessionConfig.tools || [],
          tool_choice: sessionConfig.tool_choice || "auto",
          input_audio_transcription:
            sessionConfig.input_audio_transcription || { model: "whisper-1" },
          turn_detection: sessionConfig.turn_detection || {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 200,
          },
        };

        ws.send(
          JSON.stringify({
            type: "session.update",
            session: sessionPayload,
          }),
        );

        console.log(
          "[Realtime] Session configured with vector store:",
          config.config.vectorStoreId,
        );

        const captureStarted = await startAudioCapture(ws);
        if (!captureStarted) {
          console.warn("[Realtime] Microphone capture failed; closing session");
          ws.close();
        }
      };
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleRealtimeEvent(data);
      };

      ws.onclose = (event) => {
        console.log("[Realtime] Disconnected", {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
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
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);

        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        if (ws.readyState === WebSocket.OPEN) {
          const uint8Array = new Uint8Array(pcm16.buffer);
          const base64 = btoa(
            String.fromCharCode.apply(null, Array.from(uint8Array)),
          );
          ws.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: base64,
            }),
          );
        } else {
          console.warn("[Realtime] WebSocket not open, state:", ws.readyState);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsRecording(true);
      setStatus("Listening...");
      return true;
    } catch (error) {
      console.error("[Realtime] Microphone access denied:", error);
      setStatus("Microphone access denied");
      alert("Please allow microphone access to use voice chat.");
      setIsConnected(false);
      setIsRecording(false);
      return false;
    }
  };

  const handleRealtimeEvent = (event: any) => {
    console.log("[Realtime Event]:", event.type, event);

    // Log session details to verify model being used
    if (event.type === "session.created" || event.type === "session.updated") {
      console.log("[Realtime Session]:", {
        model: event.session?.model,
        modalities: event.session?.modalities,
        voice: event.session?.voice,
        turn_detection: event.session?.turn_detection,
      });
    }

    switch (event.type) {
      case "input_audio_buffer.speech_started":
        // User started speaking - interrupt any ongoing response
        console.log("[Interrupt] User started speaking");
        setStatus("Listening...");

        // Cancel ongoing response only if AI is currently responding
        if (
          isRespondingRef.current &&
          wsRef.current?.readyState === WebSocket.OPEN
        ) {
          wsRef.current.send(
            JSON.stringify({
              type: "response.cancel",
            }),
          );
          console.log("[Interrupt] Cancelled active response");
          isRespondingRef.current = false;
        }

        // Clear audio queue to stop playback immediately
        audioQueueRef.current = [];
        break;

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

      case "response.created":
        // Response started
        isRespondingRef.current = true;
        break;

      case "response.audio.delta":
        // Play audio response
        console.log(
          "[Audio Delta] Received chunk, length:",
          event.delta?.length,
        );
        playAudioChunk(event.delta);
        setStatus("Izacc speaking...");
        break;

      case "response.audio_transcript.done":
        // Full transcript available
        console.log("[Audio Transcript Done]:", event.transcript);
        break;

      case "response.done":
        // Response finished
        isRespondingRef.current = false;
        setStatus("Listening...");
        break;

      case "response.function_call_arguments.done":
        // Tool called
        console.log("[Tool Called]:", event.name, event.arguments);
        handleToolCall(event.call_id, event.name, event.arguments);
        setStatus(`Using tool: ${event.name}...`);
        break;

      case "error":
        console.error("[Realtime Error]:", JSON.stringify(event, null, 2));
        console.error("[Error Details]:", {
          type: event.error?.type,
          code: event.error?.code,
          message: event.error?.message,
          param: event.error?.param,
        });
        if (event.error?.message) {
          setStatus(`Error: ${event.error.message}`);
        } else {
          setStatus("Realtime error. See console for details.");
        }
        break;
    }
  };

  const handleToolCall = async (callId: string, name: string, args: string) => {
    try {
      const parsedArgs = JSON.parse(args);
      let result = "";

      if (name === "searchProducts") {
        // Call vector search (primary product search)
        console.log("[Tool] Calling vector search:", parsedArgs.query);
        const response = await fetch("/api/tools/vector-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: parsedArgs.query }),
        });
        const data = await response.json();
        result = data.result || "No products found in catalog";
        console.log("[Tool] Vector search result:", result.substring(0, 200));
      } else if (name === "searchtool") {
        // Call Perplexity search (fallback/web search)
        console.log("[Tool] Calling Perplexity search:", parsedArgs.query);
        const response = await fetch("/api/tools/perplexity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: parsedArgs.query }),
        });
        const data = await response.json();
        result = data.result || "No results found";
        console.log("[Tool] Perplexity result:", result.substring(0, 200));
      } else if (name === "sendemail") {
        // Call email send
        console.log("[Tool] Calling sendemail:", parsedArgs);

        const messageText =
          `${parsedArgs?.message || ""} ${parsedArgs?.note || ""}`.toLowerCase();

        if (parsedArgs?.emailType === "trade_in") {
          result =
            "Trade-in submissions must go through tradein_update_lead followed by tradein_submit_lead. Do not use sendemail for trade-ins.";
          console.warn("[Tool] Blocked trade-in attempt via sendemail.");
        } else if (
          messageText.includes("trade in") ||
          messageText.includes("trade-in") ||
          messageText.includes("tradein")
        ) {
          result =
            "This sounds like a trade-in request. Please submit it with tradein_update_lead and tradein_submit_lead instead of sendemail.";
          console.warn("[Tool] Blocked trade-in language via sendemail.");
        } else {
          const response = await fetch("/api/tools/email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(parsedArgs),
          });
          const data = await response.json();
          result = data.result || "Email sent successfully";
          console.log("[Tool] Email result:", result);
        }
      } else if (name === "tradein_update_lead") {
        // Update trade-in lead data
        console.log("[Tool] Updating trade-in lead:", parsedArgs);
        const response = await fetch("/api/tradein/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            ...parsedArgs,
          }),
        });
        const data = await response.json();
        result = data.success
          ? "Lead updated successfully"
          : `Error: ${data.error || "Failed to update lead"}`;
        console.log("[Tool] Trade-in update result:", result);
      } else if (name === "tradein_submit_lead") {
        // Submit final trade-in lead and send email
        console.log("[Tool] Submitting trade-in lead:", parsedArgs);
        const response = await fetch("/api/tradein/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            summary: parsedArgs.summary || "Trade-in request from voice chat",
            notify: parsedArgs.notify !== false, // Default true
            status: parsedArgs.status || "in_review",
          }),
        });
        const data = await response.json();
        result = data.success
          ? "Trade-in submitted successfully. Our team will contact you within 24 hours."
          : `Error: ${data.error || "Failed to submit trade-in"}`;
        console.log("[Tool] Trade-in submit result:", result);
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

  // Initialize PCM16 playback with ScriptProcessorNode
  const initializePlayback = () => {
    if (playbackContextRef.current) {
      return playbackContextRef.current;
    }

    try {
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass({ sampleRate: 24000 });
      playbackContextRef.current = ctx;

      // Create ScriptProcessorNode for continuous playback
      const node = ctx.createScriptProcessor(2048, 1, 1);
      playbackNodeRef.current = node;

      node.onaudioprocess = (e) => {
        const out = e.outputBuffer.getChannelData(0);
        let offset = 0;

        while (offset < out.length) {
          if (audioQueueRef.current.length === 0) {
            // No data – output silence
            for (; offset < out.length; offset++) out[offset] = 0;
            break;
          }

          const chunk = audioQueueRef.current[0];
          const copyCount = Math.min(chunk.length, out.length - offset);
          out.set(chunk.subarray(0, copyCount), offset);
          offset += copyCount;

          if (copyCount === chunk.length) {
            audioQueueRef.current.shift(); // Finished this chunk
          } else {
            audioQueueRef.current[0] = chunk.subarray(copyCount); // Keep remainder
          }
        }
      };

      node.connect(ctx.destination);
      console.log("[Playback] Initialized, AudioContext state:", ctx.state);

      if (ctx.state === "suspended") {
        ctx.resume().then(() => {
          console.log("[Playback] AudioContext resumed");
        });
      }

      return ctx;
    } catch (error) {
      console.error("[Playback Init Error]:", error);
      return null;
    }
  };

  // Push base64 PCM16 audio to playback queue
  const playAudioChunk = (base64Audio: string) => {
    try {
      if (!base64Audio) return;

      // Decode base64 to PCM16
      const buf = Uint8Array.from(atob(base64Audio), (c) =>
        c.charCodeAt(0),
      ).buffer;
      const i16 = new Int16Array(buf);
      const f32 = new Float32Array(i16.length);

      // Convert [-32768, 32767] -> [-1, 1]
      for (let i = 0; i < i16.length; i++) {
        f32[i] = Math.max(-1, Math.min(1, i16[i] / 32768));
      }

      audioQueueRef.current.push(f32);
      console.log(
        "[Play Audio] Queued",
        i16.length,
        "samples, queue size:",
        audioQueueRef.current.length,
      );

      // Ensure AudioContext is running
      if (playbackContextRef.current?.state === "suspended") {
        playbackContextRef.current.resume();
      }
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

    if (playbackNodeRef.current) {
      playbackNodeRef.current.disconnect();
      playbackNodeRef.current = null;
    }

    if (playbackContextRef.current) {
      playbackContextRef.current.close();
      playbackContextRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Clear audio queue
    audioQueueRef.current = [];

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
        <div className="flex flex-col items-center gap-6 p-6">
          {/* Microphone Visual Indicator */}
          <div className="relative flex items-center justify-center">
            {/* Pulsing ring animation */}
            <div
              className={`absolute w-32 h-32 rounded-full bg-primary/20 ${isRecording ? "animate-ping" : ""}`}
            />

            {/* Microphone button - FIXED CIRCULAR SHAPE */}
            <button
              className="relative w-24 h-24 rounded-full bg-gradient-to-br from-primary to-primary/80 shadow-lg flex items-center justify-center hover:scale-105 transition-transform aspect-square"
              style={{ aspectRatio: "1 / 1" }}
              aria-label="Microphone active"
            >
              <Mic className="w-12 h-12 text-white" />
            </button>
          </div>

          <div className="p-4 bg-primary/10 rounded-lg border border-primary/20 w-full">
            <p className="text-sm text-center">
              🎙️ Voice chat active - Speak naturally, Amara is listening!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
