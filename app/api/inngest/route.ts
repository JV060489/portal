import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { aiChatFunction } from "@/inngest/functions/ai-chat";

export const runtime = "nodejs";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [aiChatFunction],
});
