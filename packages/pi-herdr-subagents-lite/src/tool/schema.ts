import { Type } from "typebox";

interface RunParameters {
  action: "run";
  profile: string;
  task: string;
  cwd?: string;
}

interface SendParameters {
  action: "send";
  name: string;
  message: string;
}

export type SubagentParameters = RunParameters | SendParameters;

export const parameters = Type.Unsafe<SubagentParameters>({
  type: "object",
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { const: "run" },
        profile: { type: "string" },
        task: { type: "string", minLength: 1 },
        cwd: { type: "string", minLength: 1 },
      },
      required: ["action", "profile", "task"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { const: "send" },
        name: { type: "string", pattern: "^[a-z][a-z0-9_-]{0,31}$" },
        message: { type: "string", minLength: 1 },
      },
      required: ["action", "name", "message"],
    },
  ],
});
