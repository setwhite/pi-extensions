import { closeSync, openSync, readSync } from "node:fs";

export const TAIL_WINDOW_BYTES = 1024 * 1024;

const NEWLINE = 0x0a;

function readBytes(path: string, start: number, length: number): Buffer {
  const buffer = Buffer.alloc(length);
  const fd = openSync(path, "r");
  try {
    let offset = 0;
    while (offset < length) {
      const bytesRead = readSync(fd, buffer, offset, length - offset, start + offset);
      if (bytesRead === 0) {
        break;
      }
      offset += bytesRead;
    }
    return buffer.subarray(0, offset);
  } finally {
    closeSync(fd);
  }
}

export function readTail(path: string, size: number): string {
  const start = Math.max(0, size - TAIL_WINDOW_BYTES);
  const window = readBytes(path, start, size - start);
  if (start === 0) {
    return window.toString("utf8");
  }
  const newline = window.indexOf(NEWLINE);
  return newline === -1 ? "" : window.subarray(newline + 1).toString("utf8");
}
