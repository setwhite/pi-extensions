# config

读 `<agent-dir>/pi-herdr-subagents-lite/config.json`，给全包提供唯一一份已校验配置。

## 用法

~~~ts
import { agentDir, loadConfig, runsDir } from "../config/index.ts";

const config = loadConfig(agentDir());
const dir = runsDir(agentDir());
~~~

- `agentDir()` 读 `PI_CODING_AGENT_DIR`，未设时回落到 `~/.pi/agent`。
- 文件不存在即全默认值；JSON 坏了、字段类型不对、出现未知键都直接抛错，错误信息带字段名。
- 字段与默认值见[契约 §7](../specs/0002_v2_architecture_spec.md)。

## 取舍

- 未知键报错而不是忽略：配置拼错时立刻暴露，比运行时行为悄悄变形好。
- 不做多层合并。v1 的全局 + 项目两层查找已删，配置只有一处。
