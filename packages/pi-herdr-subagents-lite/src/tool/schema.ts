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

/** 只写模型猜不到或容易猜反的字段；id/objective/context/cwd/model/thinking 看名字就够。 */
export const parameters = Type.Unsafe<SubagentParameters>({
  type: "object",
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { type: "string", const: "spawn" },
        id: ID,
        objective: { type: "string", minLength: 1 },
        context: { type: "string" },
        cwd: { type: "string", minLength: 1 },
        worktree: { type: "boolean", description: "Set true when child may write to this repo." },
        tools: {
          ...strings,
          description: "Replaces default tool set.",
        },
        skills: {
          ...strings,
          description: "Extra skill paths.",
        },
        model: { type: "string", minLength: 1 },
        thinking: { type: "string", minLength: 1 },
      },
      required: ["action", "id", "objective"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { type: "string", const: "steer" },
        id: ID,
        message: {
          type: "string",
          minLength: 1,
          description: "Interrupts a running child first.",
        },
      },
      required: ["action", "id", "message"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { type: "string", const: "inspect" },
        id: ID,
      },
      required: ["action"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { type: "string", const: "stop" },
        id: ID,
      },
      required: ["action", "id"],
    },
  ],
});
