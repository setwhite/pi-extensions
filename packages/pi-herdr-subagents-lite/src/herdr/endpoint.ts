// Windows 的 herdr 把 socket 暴露成 named pipe：HERDR_SOCKET_PATH 的值只是管道名，
// 连接前必须补 pipe 命名空间前缀；Unix 直接连 UDS 路径。
const BACKSLASH = String.fromCharCode(92);
const PIPE_PREFIX = BACKSLASH + BACKSLASH + "." + BACKSLASH + "pipe" + BACKSLASH;

export function socketEndpoint(socketPath: string, platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? PIPE_PREFIX + socketPath : socketPath;
}
