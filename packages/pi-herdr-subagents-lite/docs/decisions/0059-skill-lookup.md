# 0059 skills 白名单按名字查 pi 的发现集

`skills: [a, b]` 原来只认 `<agent-dir>/skills/<name>`，`.pi/skills`、`.agents/skills`、包内与 settings 配置的 skill 都用不上。

现在名字交给 pi 自己的发现器解析：`DefaultPackageManager.resolve()` 出路径，`loadSkills()` 出 `name → filePath`。白名单的寻址范围等于 pi 默认发现集。名字查不到报 `profile_invalid`。

依据：不复制 pi 的发现规则。不缓存：`run` 由人触发，一次目录扫描是毫秒级。

## Considered Options

- 列表项写路径：15 行，但用户要手写 `../.pi/skills/x`。
- 子进程用 `/skill:<name>` 强制调用：只增加调用，不能收缩 skill 集；本仓任务走 inbox（DEC-0026），`/skill:` 能否展开未验证。
- 从父 system prompt 的 `<available_skills>` 扒路径：格式属内部约定，`disable-model-invocation` 的 skill 不在里面。

## Consequences

- 每次 `run` 与 `send` 重启多一次磁盘扫描。
- 改 skill 后要重启 pi 才生效。
- `SettingsManager.create` 的 `projectTrusted` 默认 true，必须显式传扩展的 `trusted`，否则未受信项目也解析项目 skill。
