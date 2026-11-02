# 0057 自带 worker 示例 profile

扩展每次加载都把 `<agent-dir>/pi-herdr-subagents-lite/profiles/examples/` 对齐到包内示例。自带文件重写（现在只有 `worker.md`）。多余文件与子目录删除。所以升级后启动 pi 那次加载会刷新整个目录。

`profiles/*.md`（用户自己的 profile）一律不写。

`examples/` 整个目录是分发物，不是用户数据。旧示例留过期比丢改动更糟。所以示例随包升级覆盖整个目录。

示例的文件名与 frontmatter `name` 都是 `worker`，`description` 是 `General purpose.`。它是通用 worker，字段齐全（`model` / `thinking` / `skills` 以注释给出），作为可复制模板。`disable-model-invocation: false`（模型可见），`auto-exit: true`（收工后关 tab，槽位随之释放；再 send 时重启一个 pane，续同一个 session）。用在「一件自成一体的活，交给新上下文的子代理继续」。

取消项：直接写进 `profiles/worker.md`（默认即生效，但示例会混进用户自己的 profile 列表）。加 `/subagents-init` 命令（为一次写入扩命令面）。只在缺失时写（旧示例会一直过期，用户看到的是旧模板）。保留 `examples/` 里多出来的文件（目录一半是分发物一半是用户数据，模板与私货分不清）。

依据：用户选择示例放 `profiles/examples/` 子目录，随扩展分发。加载只看 `profiles/*.md`，所以 `examples/` 里的示例默认不生效，复制一层即用。
