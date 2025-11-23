/**
 * Gemini API Client
 * Provides OpenAI-compatible interface for Google Gemini models
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: any[];
}

interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

interface GeminiCompletionParams {
  model: string;
  messages: OpenAIMessage[];
  tools?: OpenAITool[];
  tool_choice?: any;
  temperature?: number;
  max_tokens?: number;
}

/**
 * Convert OpenAI messages to Gemini format
 */
function convertMessagesToGemini(messages: OpenAIMessage[]): {
  systemInstruction?: string;
  contents: any[];
} {
  const systemMessages = messages.filter((m) => m.role === "system");
  const systemInstruction = systemMessages.map((m) => m.content).join("\n\n");

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((msg) => {
      if (msg.role === "user") {
        return {
          role: "user",
          parts: [{ text: msg.content }],
        };
      } else if (msg.role === "assistant") {
        const parts: any[] = [];
        
        // Add text content
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        
        // Add tool calls
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          msg.tool_calls.forEach((toolCall) => {
            parts.push({
              functionCall: {
                name: toolCall.function.name,
                args: JSON.parse(toolCall.function.arguments),
              },
            });
          });
        }
        
        return {
          role: "model",
          parts,
        };
      } else if (msg.role === "tool") {
        return {
          role: "function",
          parts: [
            {
              functionResponse: {
                name: "tool_result",
                response: {
                  content: msg.content,
                },
              },
            },
          ],
        };
      }
      return null;
    })
    .filter(Boolean);

  return {
    systemInstruction: systemInstruction || undefined,
    contents,
  };
}

/**
 * Convert OpenAI tools to Gemini function declarations
 */
function convertToolsToGemini(tools?: OpenAITool[]) {
  if (!tools || tools.length === 0) return undefined;

  return {
    functionDeclarations: tools.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    })),
  };
}

/**
 * Create chat completion using Gemini API
 * OpenAI-compatible interface
 */
export async function createGeminiChatCompletion(
  params: GeminiCompletionParams,
) {
  if (!genAI) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const { systemInstruction, contents } = convertMessagesToGemini(
    params.messages,
  );
  const tools = convertToolsToGemini(params.tools);

  // Map model names
  const modelName = params.model.includes("gemini")
    ? params.model
    : "gemini-2.0-flash-exp";

  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction,
    tools: tools ? [tools] : undefined,
  });

  const generationConfig = {
    temperature: params.temperature || 0.7,
    maxOutputTokens: params.max_tokens || 800,
  };

  const result = await model.generateContent({
    contents,
    generationConfig,
  });

  const response = result.response;
  const candidate = response.candidates?.[0];

  if (!candidate) {
    throw new Error("No response from Gemini");
  }

  // Convert to OpenAI format
  const message: any = {
    role: "assistant",
    content: null,
  };

  const textParts = candidate.content.parts.filter((p: any) => p.text);
  if (textParts.length > 0) {
    message.content = textParts.map((p: any) => p.text).join("");
  }

  const functionCalls = candidate.content.parts.filter(
    (p: any) => p.functionCall,
  );
  if (functionCalls.length > 0) {
    message.tool_calls = functionCalls.map((p: any, idx: number) => ({
      id: `call_${Date.now()}_${idx}`,
      type: "function",
      function: {
        name: p.functionCall.name,
        arguments: JSON.stringify(p.functionCall.args),
      },
    }));
  }

  // Return OpenAI-compatible response
  return {
    id: `gemini-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: modelName,
    choices: [
      {
        index: 0,
        message,
        finish_reason: candidate.finishReason?.toLowerCase() || "stop",
      },
    ],
    usage: {
      prompt_tokens: response.usageMetadata?.promptTokenCount || 0,
      completion_tokens: response.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: response.usageMetadata?.totalTokenCount || 0,
    },
  };
}
