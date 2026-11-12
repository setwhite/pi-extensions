export interface Aggregator<T> {
  // 返回是否真的投递成功。批量窗口内的条目在 flush 之后才结算。
  push(item: T): Promise<boolean>;
  stop(): void;
}

export interface AggregatorOptions<T> {
  windowMs: number;
  deliver: (items: T[]) => void | Promise<void>;
  onError: (error: unknown) => void;
}

interface Queued<T> {
  item: T;
  resolve: (delivered: boolean) => void;
}

export function createAggregator<T>({ windowMs, deliver, onError }: AggregatorOptions<T>): Aggregator<T> {
  let pending: Array<Queued<T>> = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const send = async (items: Array<Queued<T>>) => {
    let delivered = true;
    try {
      await deliver(items.map((entry) => entry.item));
    } catch (error) {
      delivered = false;
      onError(error);
    }
    for (const entry of items) {
      entry.resolve(delivered);
    }
  };

  const flush = () => {
    timer = undefined;
    const items = pending;
    pending = [];
    if (items.length > 0) {
      void send(items);
    }
  };

  return {
    push(item) {
      if (stopped) {
        return Promise.resolve(false);
      }
      return new Promise<boolean>((resolve) => {
        if (windowMs === 0) {
          void send([{ item, resolve }]);
          return;
        }
        pending.push({ item, resolve });
        if (timer === undefined) {
          timer = setTimeout(flush, windowMs);
          timer.unref?.();
        }
      });
    },
    stop() {
      stopped = true;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      for (const entry of pending) {
        entry.resolve(false);
      }
      pending = [];
    },
  };
}
