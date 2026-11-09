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

## 不写 primer

原计划让 `src/prompt/` 把一段约 2,500 字符的说明写进 `event.systemPromptOptions.sections`。取消。

给模型的 Chrome 说明全部写成 `promptGuidelines` 条目：每个工具带默认规则，`guidance.<id>.promptGuidelines` 整段替换。规则由工具自己带进系统提示，pi 平铺进 `<rules>` 段并去重。

四条理由：

1. pi 自己的内置工具就是「代码里一个 `guidelines` 常量」，不用 sections。照它走最不容易出意外。
2. `promptGuidelines` 只在工具启用时进入系统提示。关掉 `chrome_cdp`，它的规则自动消失。用 sections 得手写过滤。
3. pi 会按原文去重（`buildRules` 里的 `seen` 集合），sections 不会。
4. 少一个模块、两个配置字段、一份「按已注册工具生成文本」的逻辑。

代价：规则是一串 `- ` 条目，不是分段 prose。每条必须点名工具，写起来啰嗦一点。

## 代价

配置是 11 个标量加两个记录。校验与测试多约 80 行。12,000 字符预算只在默认配置下断言；用户自己覆盖后可以超出。

## 修订 2026-11-09

`prompt.guidelines` 已删，默认三条搬进 `chrome_act` 的 `promptGuidelines`。

- 两层的机制相同，只是作用域不同。兄弟包都只有按工具一层，用户要学两套写法。
- 默认三条全部点名 `chrome_act`。关掉 `chrome_act` 后它们仍进系统提示，违反上面「关掉的工具的规则也一起消失」。
- 跨工具的规则写进 AGENTS.md。那是 pi 原生位置，很多包都读。

代价：写了这个键的配置会以 `prompt: unknown key` 启动失败。

## 不做

不做 `activation: deferred`。兄弟包用它让宿主的 `tool_search` 按需发现工具。本包只有 5 个工具，延迟发现要在会话开始再激活一次，收益不够。
