export function leadingChars(text: string, limit: number): string {
  const last = text.charCodeAt(limit - 1);
  const cut = last >= 0xd800 && last <= 0xdbff ? limit - 1 : limit;
  return text.slice(0, cut);
}
