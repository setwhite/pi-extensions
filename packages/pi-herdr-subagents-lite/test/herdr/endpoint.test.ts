import { describe, expect, it } from "vitest";
import { socketEndpoint } from "../../src/herdr/endpoint.ts";

const BACKSLASH = String.fromCharCode(92);
const PIPE_PREFIX = BACKSLASH + BACKSLASH + "." + BACKSLASH + "pipe" + BACKSLASH;
const WINDOWS_PATH = ["C:", "herdr", "herdr.sock"].join(BACKSLASH);

describe("socketEndpoint", () => {
  it("prefixes the named pipe namespace on windows", () => {
    expect(socketEndpoint(WINDOWS_PATH, "win32")).toBe(PIPE_PREFIX + WINDOWS_PATH);
  });

  it("returns the unix socket path unchanged", () => {
    expect(socketEndpoint("/home/u/.config/herdr/herdr.sock", "linux")).toBe("/home/u/.config/herdr/herdr.sock");
  });
});
