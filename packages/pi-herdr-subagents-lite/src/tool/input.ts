import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { type ChildQuestion, writeChildResult } from "../run/index.ts";

export interface RequestInputParameters {
  questions: ChildQuestion[];
}

export const inputParameters = Type.Unsafe<RequestInputParameters>({
  type: "object",
  additionalProperties: false,
  properties: {
    questions: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          question: { type: "string", minLength: 1 },
          context: { type: "string" },
          options: { type: "array", items: { type: "string", minLength: 1 } },
        },
        required: ["question"],
      },
    },
  },
  required: ["questions"],
});

export const REQUEST_INPUT_TOOL = "request_input";

export type RequestInputTool = ToolDefinition<typeof inputParameters>;

export interface RequestInputDeps {
  runDir: string;
  summaryMaxChars: number;
}

/** 子代理唯一的人工出口：问题落盘后结束回合，由主代理合并成一次 ask。 */
export function createRequestInputTool({ runDir, summaryMaxChars }: RequestInputDeps) {
  return {
    name: REQUEST_INPUT_TOOL,
    label: "Request Input",
    description: "Ask the orchestrator a question, then end your turn and wait for the answer.",
    promptGuidelines: [
      "request_input: use it instead of asking in prose; the orchestrator relays human answers.",
      "request_input: after calling it, stop working and end the turn.",
    ],
    parameters: inputParameters,
    async execute(_toolCallId: string, params: RequestInputParameters) {
      const seq = await writeChildResult(runDir, {
        state: "needs_input",
        questions: params.questions,
        limit: summaryMaxChars,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `questions recorded (seq ${seq}). End the turn now; the orchestrator will steer the answer back.`,
          },
        ],
        details: { seq },
        isError: false,
      };
    },
  };
}
