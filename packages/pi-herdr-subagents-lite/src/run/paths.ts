import { relative } from "node:path";

export function samePath(left: string, right: string): boolean {
  return relative(left, right) === "";
}
