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

const ID = { type: "string", pattern: "^[a-z][a-z0-9_-]{0,31}$" } as const;
const strings = { type: "array", items: { type: "string", minLength: 1 } } as const;

export const parameters = Type.Unsafe<SubagentParameters>({
  type: "object",
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { const: "spawn" },
        id: ID,
        objective: { type: "string", minLength: 1 },
        context: { type: "string" },
        cwd: { type: "string", minLength: 1 },
        worktree: { type: "boolean" },
        tools: strings,
        skills: strings,
        model: { type: "string", minLength: 1 },
        thinking: { type: "string", minLength: 1 },
      },
      required: ["action", "id", "objective"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { const: "steer" },
        id: ID,
        message: { type: "string", minLength: 1 },
      },
      required: ["action", "id", "message"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { const: "inspect" },
        id: ID,
      },
      required: ["action"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { const: "stop" },
        id: ID,
      },
      required: ["action", "id"],
    },
  ],
});
