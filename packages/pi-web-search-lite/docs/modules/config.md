# config/

配置文件的加载、校验与 clamp。只依赖 `node:` 标准库，不碰网络与宿主 API。

字段、默认值、clamp 区间、错误文本与 key 合并都在 `src/config/schema.ts`、`src/config/validate.ts` 与 `src/config/index.ts`。本文不复述，形状由 `test/config.test.ts` 钉住。

## 取舍

- 数值越界只 clamp，其余非法即抛错。理由见 [DEC-0005](../decisions/0005-strict-config-validation.md)。
- 默认值的可读版本只在根 `README.md`（英文）/ `README.zh-CN.md`（中文）的「完整示例」。本文不列默认值，避免第三份副本。

## 指针

- 三道上限各自的作用对象。`fetch.maxCharsPerPage` 管提取器链拿回的正文，不含 GitHub handler。`handlers.github.maxChars` 管 gh 输出渲染成 markdown 后的正文。`context.maxInlineChars` / `maxInlineLines` 管发给模型的信封。前两道切片后不保留全文。`context.*` 在 `spillToFile` 为真时把全文落临时文件。GitHub 页面只过后两道。普通网页只过第 1、3 道。`raw` 只过第 3 道。
- agent dir 与配置文件路径：术语见 `docs/GLOSSARY.md`「agent dir」。实现见 `defaultConfigPath`。
