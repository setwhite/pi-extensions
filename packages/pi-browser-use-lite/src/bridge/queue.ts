/**
 * 在途命令表与 `/next` 的等待队列。串行：一次只投递一条。
 * 只管排队与摘取。超时的理由、取消、投递都在门面里，这里只按 {@link PendingEntry} 记账。
 */

import type { BridgeCommand } from "../protocol/index.ts";

/** 排队中的命令。`remainingMs` 要到交给扩展的那一刻才成立，见 `/next`。 */
export type QueuedCommand = Omit<BridgeCommand, "remainingMs">;

/** 挂起中的 `/next`。`cancel` 清定时器并让它立刻返回。 */
export interface Waiter {
	resolve: (entry: PendingEntry | undefined) => void;
	cancel: () => void;
}

export interface PendingEntry {
	command: QueuedCommand;
	/** 命令到期时刻。调用方与扩展共用这一个预算。 */
	expiresAt: number;
	deliveredAt?: number;
	timer: NodeJS.Timeout;
	detach: () => void;
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
}

export class CommandQueue {
	private readonly queue: PendingEntry[] = [];
	/** 挂起的 `/next`，先到先服务。 */
	private waiters: Waiter[] = [];
	private readonly pending = new Map<string, PendingEntry>();

	get queuedCount(): number {
		return this.queue.length;
	}

	get pendingCount(): number {
		return this.pending.size;
	}

	/** 入队。已经有 `/next` 挂着就直接交给它，不进队列。 */
	add(entry: PendingEntry): void {
		this.pending.set(entry.command.id, entry);
		const waiter = this.waiters.shift();
		if (waiter === undefined) this.queue.push(entry);
		else waiter.resolve(entry);
	}

	/** 取一条。队列空就挂起到 `holdMs`，或等到有人入队。 */
	take(
		holdMs: number,
		register?: (waiter: Waiter) => void,
	): Promise<PendingEntry | undefined> {
		const queued = this.queue.shift();
		if (queued !== undefined) return Promise.resolve(queued);
		return new Promise<PendingEntry | undefined>((resolveWait) => {
			const waiter: Waiter = {
				resolve: (entry) => {
					clearTimeout(timer);
					resolveWait(entry);
				},
				cancel: () => {
					clearTimeout(timer);
					resolveWait(undefined);
				},
			};
			const timer = setTimeout(() => this.drop(waiter), holdMs);
			this.waiters.push(waiter);
			register?.(waiter);
		});
	}

	/** 长轮询在投递前断线：把取走的命令放回队首，别丢。 */
	restore(entry: PendingEntry): void {
		this.queue.unshift(entry);
	}

	/** 撤掉一次挂起的等待。 */
	drop(waiter: Waiter): void {
		this.waiters = this.waiters.filter((item) => item !== waiter);
		waiter.cancel();
	}

	/** 停服：挂起的 `/next` 立刻返回 `none`。 */
	cancelAll(): void {
		for (const waiter of this.waiters) waiter.cancel();
		this.waiters = [];
	}

	/** 按 id 摘走在途命令。认不出返回 `undefined`。 */
	claim(id: string): PendingEntry | undefined {
		const entry = this.pending.get(id);
		if (entry === undefined) return undefined;
		this.remove(entry);
		return entry;
	}

	/** 立刻以失败结束一条命令。已经结束过的再调无效。 */
	fail(entry: PendingEntry, error: Error): void {
		if (!this.remove(entry)) return;
		entry.reject(error);
	}

	/** 在途命令的快照，停服时用。 */
	entries(): PendingEntry[] {
		return [...this.pending.values()];
	}

	/**
	 * 从在途表与队列里摘掉，并清定时器与 abort 监听。
	 * 已经摘过就返回 false：同一条命令只能 settle 一次。
	 */
	private remove(entry: PendingEntry): boolean {
		if (!this.pending.delete(entry.command.id)) return false;
		clearTimeout(entry.timer);
		entry.detach();
		const index = this.queue.indexOf(entry);
		if (index >= 0) this.queue.splice(index, 1);
		return true;
	}
}
