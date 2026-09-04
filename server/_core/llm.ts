import { GoogleGenAI } from "@google/genai";
import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?:
      | "audio/mpeg"
      | "audio/wav"
      | "application/pdf"
      | "audio/mp4"
      | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  model?: string;
  thinking?: Record<string, unknown>;
  reasoning?: Record<string, unknown>;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

const ensureArray = (
  value: MessageContent | MessageContent[],
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent,
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }
  if (part.type === "text" || part.type === "image_url" || part.type === "file_url") {
    return part;
  }
  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map((part) => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

// --- Google Gemini Provider Implementation ---
async function invokeGemini(params: InvokeParams): Promise<InvokeResult> {
  const ai = new GoogleGenAI({ apiKey: ENV.geminiApiKey });

  let systemInstruction: string | undefined;
  const contents: Array<{ role: "user" | "model"; parts: Array<Record<string, unknown>> }> = [];

  for (const msg of params.messages) {
    if (msg.role === "system") {
      const parts = ensureArray(msg.content).map(normalizeContentPart);
      const text = parts.map((p) => (p.type === "text" ? p.text : "")).join("\n");
      systemInstruction = systemInstruction ? `${systemInstruction}\n${text}` : text;
      continue;
    }

    const geminiRole = msg.role === "assistant" ? "model" : "user";
    const parts = ensureArray(msg.content).map(normalizeContentPart);
    const geminiParts: Array<Record<string, unknown>> = [];

    for (const part of parts) {
      if (part.type === "text") {
        geminiParts.push({ text: part.text });
      } else if (part.type === "image_url") {
        const url = part.image_url.url;
        if (url.startsWith("data:")) {
          const [header, base64Data] = url.split(",");
          const mimeType = header.split(";")[0].replace("data:", "") || "image/png";
          geminiParts.push({
            inlineData: {
              mimeType,
              data: base64Data,
            },
          });
        } else {
          geminiParts.push({ text: `[Image reference: ${url}]` });
        }
      } else if (part.type === "file_url") {
        const url = part.file_url.url;
        if (url.startsWith("data:")) {
          const [header, base64Data] = url.split(",");
          const mimeType =
            part.file_url.mime_type || header.split(";")[0].replace("data:", "") || "application/pdf";
          geminiParts.push({
            inlineData: {
              mimeType,
              data: base64Data,
            },
          });
        } else {
          geminiParts.push({ text: `[File reference: ${url}]` });
        }
      }
    }

    if (geminiParts.length > 0) {
      contents.push({ role: geminiRole, parts: geminiParts });
    }
  }

  // Model selection: fallback to Gemini 3.7 Flash
  let targetModel = params.model || ENV.geminiModel || "gemini-3.7-flash";
  if (!targetModel.startsWith("gemini-") && !targetModel.startsWith("gemma-")) {
    targetModel = "gemini-3.7-flash";
  }

  const config: Record<string, unknown> = {};
  if (systemInstruction) {
    config.systemInstruction = systemInstruction;
  }
  const maxTokens = params.max_tokens ?? params.maxTokens;
  if (typeof maxTokens === "number") {
    config.maxOutputTokens = maxTokens;
  }

  const explicitFormat = params.responseFormat || params.response_format;
  const schema = params.outputSchema || params.output_schema;
  if (explicitFormat?.type === "json_object" || explicitFormat?.type === "json_schema" || schema) {
    config.responseMimeType = "application/json";
    if (explicitFormat?.type === "json_schema" && explicitFormat.json_schema?.schema) {
      config.responseSchema = explicitFormat.json_schema.schema;
    } else if (schema?.schema) {
      config.responseSchema = schema.schema;
    }
  }

  const response = await ai.models.generateContent({
    model: targetModel,
    contents,
    config,
  });

  return {
    id: `gemini-${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    model: targetModel,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: response.text || "",
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: response.usageMetadata?.promptTokenCount ?? 0,
      completion_tokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      total_tokens: response.usageMetadata?.totalTokenCount ?? 0,
    },
  };
}

// --- Forge / OpenAI Fallback Implementation ---
const RETRY_MAX_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 500;
const RETRY_MAX_DELAY_MS = 30_000;

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const parseRetryAfter = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
};

const computeBackoffDelay = (attempt: number, retryAfterMs?: number): number => {
  const cap = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
  const jittered = cap / 2 + Math.random() * (cap / 2);
  return Math.min(Math.max(jittered, retryAfterMs ?? 0), RETRY_MAX_DELAY_MS);
};

const fetchWithBackoff = async (url: string, init: FetchInit): Promise<Response> => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.ok || attempt === RETRY_MAX_RETRIES) {
        return response;
      }
      const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
      try {
        await response.body?.cancel();
      } catch {}
      await sleep(computeBackoffDelay(attempt, retryAfterMs));
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_MAX_RETRIES) throw error;
      await sleep(computeBackoffDelay(attempt));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("LLM request failed after exhausting retries");
};

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  if (!ENV.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not configured in environment variables");
  }
  return invokeGemini(params);
}

export type ModelInfo = {
  id: string;
  object: string;
  created: number;
  owned_by: string;
};

export type ModelsResponse = {
  object: string;
  data: ModelInfo[];
};

export async function listLLMModels(): Promise<ModelsResponse> {
  return {
    object: "list",
    data: [
      { id: "gemini-3.7-flash", object: "model", created: Date.now(), owned_by: "google" },
      { id: "gemini-3.6-flash", object: "model", created: Date.now(), owned_by: "google" },
      { id: "gemini-2.0-flash", object: "model", created: Date.now(), owned_by: "google" },
    ],
  };
}

