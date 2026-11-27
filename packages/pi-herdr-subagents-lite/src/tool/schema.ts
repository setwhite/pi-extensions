import { Type } from "typebox";

export interface SpawnParameters {
  action: "spawn";
  id: string;
  objective: string;
  context?: string;
  cwd?: string;
  worktree?: boolean;
  tools?: string[];
  skills?: string[];
  model?: string;
  thinking?: string;
}

export interface SteerParameters {
  action: "steer";
  id: string;
  message: string;
}

export interface InspectParameters {
  action: "inspect";
  id?: string;
}

export interface StopParameters {
  action: "stop";
  id: string;
}

export type SubagentParameters = SpawnParameters | SteerParameters | InspectParameters | StopParameters;

const ACTION = { type: "string", description: "Operation to run." } as const;
const ID = {
  type: "string",
  pattern: "^[a-z][a-z0-9_-]{0,31}$",
  description: "Run id, also the child tab label. Unique within this session.",
} as const;
const strings = { type: "array", items: { type: "string", minLength: 1 } } as const;

export const parameters = Type.Unsafe<SubagentParameters>({
  type: "object",
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { ...ACTION, const: "spawn" },
        id: ID,
        objective: {
          type: "string",
          minLength: 1,
          description: "The task the child must complete, written as an instruction to it.",
        },
        context: {
          type: "string",
          description:
            "Reference material for the objective: paths, prior findings, constraints. Omit when the objective stands alone.",
        },
        cwd: {
          type: "string",
          minLength: 1,
          description: "Child working directory. Defaults to this session's cwd.",
        },
        worktree: {
          type: "boolean",
          description:
            "Run the child in its own git worktree. Set it when the child may write files in this repository; leave it out for read-only work.",
        },
        tools: {
          ...strings,
          description: "Tools the child may call. Omit to inherit this session's tool set; passing a list replaces it.",
        },
        skills: {
          ...strings,
          description: "Extra skill paths to load into the child. Omit to use the normal skill discovery.",
        },
        model: {
          type: "string",
          minLength: 1,
          description: "Model id for the child. Omit to use the configured default model.",
        },
        thinking: {
          type: "string",
          minLength: 1,
          description: "Thinking level for the child. Omit to use the configured default level.",
        },
      },
      required: ["action", "id", "objective"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { ...ACTION, const: "steer" },
        id: ID,
        message: {
          type: "string",
          minLength: 1,
          description: "Message for the child. A working child is interrupted first, then gets the message.",
        },
      },
      required: ["action", "id", "message"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { ...ACTION, const: "inspect" },
        id: { ...ID, description: "Run id to inspect. Omit to list every run." },
      },
      required: ["action"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { ...ACTION, const: "stop" },
        id: { ...ID, description: "Run id to stop." },
      },
      required: ["action", "id"],
    },
  ],
});
