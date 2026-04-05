"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import * as Y from "yjs";
import * as Sentry from "@sentry/nextjs";
import { Bot, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useYjs } from "@/lib/yjs/provider";
import {
  useYjsAddObject,
  useYjsDeleteObject,
  useYjsRenameObject,
  useYjsDuplicateObject,
  useYjsObjects,
} from "@/lib/yjs/hooks";
import { SHAPES } from "@/lib/yjs/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Message = { role: "user" | "assistant"; content: string };

type ToolCall = {
  toolName: string;
  args: Record<string, unknown>;
};

const MODELS = [
  { id: "gpt-5-nano", label: "GPT-5 Nano" },
  { id: "gpt-5.4-nano", label: "GPT-5.4 Nano" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
] as const;

// ---------------------------------------------------------------------------
// AiChatBox
// ---------------------------------------------------------------------------

export function AiChatBox({ collapsed, onCollapse }: { collapsed: boolean; onCollapse: (v: boolean) => void }) {
  const { doc, sceneMap, connected } = useYjs();
  const objects = useYjsObjects();
  const addObject = useYjsAddObject();
  const deleteObject = useYjsDeleteObject();
  const renameObject = useYjsRenameObject();
  const duplicateObject = useYjsDuplicateObject();

  const [selectedModel, setSelectedModel] = useState("gpt-5-nano");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    resizeTextarea();
  }, [input, resizeTextarea]);

  // ---------------------------------------------------------------------------
  // Execute a tool call against YJS
  // ---------------------------------------------------------------------------

  const executeToolCall = useCallback(
    (tc: ToolCall) => {
      const { toolName, args } = tc;

      switch (toolName) {
        case "add_object": {
          const geometry = args.geometry as string;
          const name =
            (args.name as string | undefined) ??
            SHAPES.find((s) => s.geometry === geometry)?.defaultName ??
            "Object";
          const presetId = args.id as string | undefined;
          addObject(geometry, name, presetId);
          break;
        }
        case "delete_object": {
          deleteObject(args.objectId as string);
          break;
        }
        case "rename_object": {
          renameObject(args.objectId as string, args.newName as string);
          break;
        }
        case "update_transform": {
          if (!connected) break;
          const objectsMap = sceneMap.get("objects") as Y.Map<Y.Map<unknown>> | undefined;
          const objMap = objectsMap?.get(args.objectId as string);
          if (!objMap) break;
          doc.transact(() => {
            const fields = ["px", "py", "pz", "rx", "ry", "rz", "sx", "sy", "sz"] as const;
            for (const key of fields) {
              if (args[key] !== undefined) objMap.set(key, args[key]);
            }
          }, "local-ai");
          break;
        }
        case "change_color": {
          if (!connected) break;
          const objectsMap = sceneMap.get("objects") as Y.Map<Y.Map<unknown>> | undefined;
          const objMap = objectsMap?.get(args.objectId as string);
          if (!objMap) break;
          doc.transact(() => {
            objMap.set("materialColor", args.color as string);
          }, "local-ai");
          break;
        }
        case "duplicate_object": {
          duplicateObject(args.objectId as string);
          break;
        }
        default:
          break;
      }
    },
    [doc, sceneMap, connected, addObject, deleteObject, renameObject, duplicateObject]
  );

  // ---------------------------------------------------------------------------
  // Poll for job completion
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!jobId) return;

    const intervalId = setInterval(async () => {
      try {
        const res = await fetch(`/api/chat/status?jobId=${jobId}`);
        const data = await res.json();

        if (data.status === "done") {
          clearInterval(intervalId);
          const toolCalls = (data.toolCalls ?? []) as ToolCall[];
          for (const tc of toolCalls) {
            executeToolCall(tc);
          }
          const assistantText =
            data.text ||
            (toolCalls.length > 0
              ? toolCalls.map((tc) => `Called ${tc.toolName}`).join(", ") + "."
              : "Done.");
          setMessages((prev) => [...prev, { role: "assistant", content: assistantText }]);
          setIsLoading(false);
          setJobId(null);
        } else if (data.status === "error") {
          clearInterval(intervalId);
          const msg = data.error ?? "Something went wrong";
          setError(msg);
          setIsLoading(false);
          setJobId(null);
          Sentry.captureMessage(`AI job failed: ${msg}`, "error");
        }
      } catch (err) {
        clearInterval(intervalId);
        setError("Failed to poll job status");
        setIsLoading(false);
        setJobId(null);
        Sentry.captureException(err);
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [jobId, executeToolCall]);

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  async function handleSubmit() {
    const text = input.trim();
    if (!text || isLoading) return;

    setInput("");
    setError(null);
    setIsLoading(true);

    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);

    try {
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          model: selectedModel,
          sceneContext: objects.map((o) => ({ id: o.id, name: o.name, geometry: o.geometry })),
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const { jobId: newJobId } = await res.json();
      setJobId(newJobId);
    } catch (err) {
      setError("Failed to send message");
      setIsLoading(false);
      Sentry.captureException(err);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="h-full w-full bg-card border-l border-border flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-accent"
            onClick={() => onCollapse(!collapsed)}
          >
            <svg
              className={`w-4 h-4 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </Button>
          {!collapsed && (
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Assistant
            </span>
          )}
        </div>
        {!collapsed && (
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={isLoading}
            className="text-xs bg-neutral-800 border border-white/10 rounded px-2 py-1 text-neutral-300 focus:outline-none focus:border-white/30 disabled:opacity-50"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {!collapsed && (
        <>
          {/* Error banner */}
          {error && (
            <div className="mx-3 mt-2 px-3 py-2 rounded-md bg-red-950 border border-red-800 text-red-300 text-xs shrink-0">
              {error}
            </div>
          )}

          {/* Messages — fills remaining space */}
          <div className="flex-1 min-h-0 flex flex-col gap-2 px-3 py-2 overflow-y-auto">
            {messages.length === 0 && !isLoading && (
              <p className="text-xs text-neutral-600 py-2 text-center">
                Ask me to add, move, rename, or recolor objects in the scene.
              </p>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-1.5 text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "bg-neutral-700 text-neutral-100"
                      : "bg-neutral-800 text-neutral-200"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-neutral-800 rounded-lg px-3 py-1.5 text-xs text-neutral-400 animate-pulse">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input row */}
          <div className="flex items-end gap-2 px-3 pb-3 pt-2 border-t border-border shrink-0">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              rows={1}
              placeholder="Ask AI to edit the scene..."
              className="flex-1 resize-none overflow-hidden bg-neutral-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-white/30 disabled:opacity-50 leading-relaxed"
              style={{ minHeight: "2.25rem", maxHeight: "10rem" }}
            />
            <button
              onClick={handleSubmit}
              disabled={isLoading || !input.trim()}
              className="shrink-0 p-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-neutral-200"
            >
              <SendHorizontal className="w-4 h-4" />
            </button>
          </div>
        </>
      )}

      {/* Collapsed icon */}
      {collapsed && (
        <div className="flex flex-col items-center gap-3 pt-3">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary" />
          </div>
        </div>
      )}
    </div>
  );
}
