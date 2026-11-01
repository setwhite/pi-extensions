# 0057 自带 domain 示例 profile

安装后首次加载时，扩展写一份示例到 `<agent-dir>/pi-herdr-subagents-lite/profiles/examples/domain.md`；文件已存在就跳过，不覆盖用户改动。

示例的文件名与 frontmatter `name` 都是 `domain`：通用领域 worker，字段齐全（`model` / `thinking` 以注释给出），作为可复制模板；`disable-model-invocation: false`（模型可见），`auto-exit: false`（保留 tab 可续聊）。用在「另一个领域的活，交给新上下文的子代理继续」。

取消项：直接写进 `profiles/domain.md`（默认即生效，但示例会混进用户自己的 profile 列表）；加 `/subagents-init` 命令（为一次写入扩命令面）；示例随包升级覆盖（会抹掉用户的改动）。

依据：用户选择示例放 `profiles/examples/` 子目录，随扩展分发；加载只看 `profiles/*.md`，所以 `examples/` 里的示例默认不生效，复制一层即用。
