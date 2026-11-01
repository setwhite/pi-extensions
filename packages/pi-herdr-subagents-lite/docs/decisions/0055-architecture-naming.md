# 0055 模块命名与文件拆分

模块名 = 职责的普通名词，单数。`extension` 只留 pi 装配；模型面拆成 `tool`；`subagent` 改 `run`；`session` 改 `session-file`；bridge 独立成模块。单文件上限 150 行，模块内文件按职责命名。

取消项：入口改名 `main.ts`（`pi -e ./src/index.ts`、package.json 与文档都要改，收益不足）；按层拆 `ports/`、`services/`、`adapters/`（违反「按职责分模块」）。

依据：`subagent/index.ts` 543 行同时承担命名、argv、轮询、结果、send；聚合、artifact、blocked、关闭四个 v1 功能都会落进它，不拆会继续膨胀。
