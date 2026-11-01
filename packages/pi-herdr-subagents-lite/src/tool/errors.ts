import type { ToolError } from "../run/index.ts";

export function notInHerdr() {
  return {
    content: [
      {
        type: "text" as const,
        text: "not_in_herdr: run pi inside a herdr pane; there is no fallback.",
      },
    ],
    details: undefined,
    isError: true,
  };
}

export function toolFailed(error: ToolError) {
  return {
    content: [{ type: "text" as const, text: `${error.code}: ${error.message}` }],
    details: { code: error.code },
    isError: true,
  };
}
