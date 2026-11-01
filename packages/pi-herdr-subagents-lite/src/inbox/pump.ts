export interface PumpOptions {
  pollMs: number;
  tick: () => void;
  onCycle: (error?: unknown) => void;
}

export function pumpInbox({ pollMs, tick, onCycle }: PumpOptions): () => void {
  const timer = setInterval(() => {
    try {
      tick();
      onCycle();
    } catch (error) {
      onCycle(error);
    }
  }, pollMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
