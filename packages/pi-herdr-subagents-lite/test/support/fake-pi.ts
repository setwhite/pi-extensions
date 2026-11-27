import type { AgentMessage, ExtensionRegistrar, SendOptions, SessionContext } from "../../src/extension/index.ts";

type Handler = (event: unknown, ctx: SessionContext) => unknown;

export interface FakePi {
  pi: ExtensionRegistrar;
  tools: Array<{ name: string }>;
  messages: Array<{ message: AgentMessage; options: SendOptions | undefined }>;
  notifications: Array<{ message: string; type: string | undefined }>;
  ctx: SessionContext;
  fire(event: "session_start" | "session_shutdown" | "turn_end", payload: unknown): Promise<void>;
}

export function fakePi(): FakePi {
  const tools: FakePi["tools"] = [];
  const messages: FakePi["messages"] = [];
  const notifications: FakePi["notifications"] = [];
  const handlers = new Map<string, Handler[]>();
  const ctx: SessionContext = {
    ui: {
      notify(message: string, type?: "info" | "warning" | "error") {
        notifications.push({ message, type });
      },
    },
  };

  const pi = {
    on(event: string, handler: Handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    registerTool(tool: { name: string }) {
      tools.push(tool);
    },
    sendMessage(message: AgentMessage, options?: SendOptions) {
      messages.push({ message, options });
    },
  };

  return {
    pi: pi as unknown as ExtensionRegistrar,
    tools,
    messages,
    notifications,
    ctx,
    async fire(event, payload) {
      for (const handler of handlers.get(event) ?? []) {
        await handler(payload, ctx);
      }
    },
  };
}
