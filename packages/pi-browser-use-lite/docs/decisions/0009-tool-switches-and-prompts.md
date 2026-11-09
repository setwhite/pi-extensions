# 0009 工具开关与可配置提示词

## 问题

固定的 5 个工具与内置提示文本都不能改。装了这个包却只用得上两三个工具时，剩下的说明白占 context。工具措辞也不能贴合个人用法。

## 选项

1. 固定不动。工具面最小，实现最省。
2. 照兄弟包：`tools` 开关与改名，`guidance` 覆盖文案。

## 选了

2。与 `pi-web-search-lite`、`pi-herdr-subagents-lite` 同一套形状，用户只需要学一次。

## 形状

```json
{
  "tools": { "chrome_act": { "enabled": true, "name": "chrome_act" } },
  "guidance": {
    "chrome_act": {
      "description": "...",
      "promptSnippet": "...",
      "promptGuidelines": ["..."]
    }
  },
}
```

## 规则

- 5 个全关抛错。至少留一个。
- 名字匹配 `^[a-z][a-z0-9_]{0,31}$`。撞宿主内置名抛错。两个工具同名抛错。都是加载期错误，不是 clamp。
- 关掉的工具不进工具面，它的规则也一起消失。
- 规则只有一层：每个工具自带默认 `promptGuidelines`，`guidance.<id>.promptGuidelines` 整段替换。跨工具的规则写 AGENTS.md。
- 规则只写句子。工具名由 `buildSurface` 拼成 `<name>: <句子>`，改名后规则跟着改名；覆盖的规则也拼，没有例外分支。
- 不给 `promptSnippet` 默认值。只有 `guidance.<id>.promptSnippet` 非空时才写进工具定义。

## 文案体量

默认工具面 2,486 字符：工具说明 436、29 条参数说明 1,392、9 条规则 658。序列化 5,578，测试按 6,500 断言，SPEC-0001 的上限是 12,000。

判据：

- 工具说明一句话，体量对齐 `web_search` 的 "Search the web; returns titles, URLs and snippets."。
- schema 说过的信息不写进文字：参数名、类型、枚举、可选性、嵌套结构交给 schema。52 个参数节点只留 29 条说明。`pi-todo-lite` 与 `pi-herdr-subagents-lite` 的参数一个说明都没有。
- 留下的说明只写 schema 读不出的四类：默认值（`timeout_ms` 15000）、单位与格式（CSS 像素、绝对路径）、副作用与优先级（`replace` 清空、`value` 替换、`steps` 最多 50 且失败即停、`paths` 交给下一个文件选择器）、名称碰撞（`press` 与 `key`）。
- 错误 `hint` 只在失败时进上下文，按「下一步动作」写，不复述消息。原因在消息里，已经在模型眼前。

## 不写 primer

原计划让 `src/prompt/` 把一段说明写进 `event.systemPromptOptions.sections`。取消：给模型的 Chrome 说明全部写成 `promptGuidelines` 条目，规则由工具自己带进系统提示，pi 平铺进 `<rules>` 段并去重。

四条理由：

1. pi 自己的内置工具就是「代码里一个 `guidelines` 常量」，不用 sections。照它走最不容易出意外。
2. `promptGuidelines` 只在工具启用时进入系统提示。关掉 `chrome_cdp`，它的规则自动消失。用 sections 得手写过滤。
3. pi 会按原文去重（`buildRules` 里的 `seen` 集合），sections 不会。
4. 少一个模块、两个配置字段、一份「按已注册工具生成文本」的逻辑。

代价：规则是一串 `- ` 条目，不是分段 prose。每条都由工具名开头，读起来重复。

## 代价

配置是 11 个标量加两个记录。校验与测试多约 80 行。

`chrome_act` 的 12 个动作不再由说明列出，只由 `action` 枚举给出；`from_*` 与 `to_*` 的单位靠 `x`、`y` 类推。

## 不做

不做 `activation: deferred`。兄弟包用它让宿主的 `tool_search` 按需发现工具。本包只有 5 个工具，延迟发现要在会话开始再激活一次，收益不够。
