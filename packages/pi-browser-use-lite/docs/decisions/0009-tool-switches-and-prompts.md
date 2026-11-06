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
  "prompt": { "guidelines": ["..."] }
}
```

## 规则

- 5 个全关抛错。至少留一个。
- 名字匹配 `^[a-z][a-z0-9_]{0,31}$`。撞宿主内置名抛错。两个工具同名抛错。都是加载期错误，不是 clamp。
- 关掉的工具不进工具面，它的规则也一起消失。
- 规则分两层：`prompt.guidelines` 放跨工具的规则，`guidance.<id>.promptGuidelines` 放该工具自己的规则。两层的默认值都在代码里。

## 不写 primer

原计划让 `src/prompt/` 把一段约 2,500 字符的说明写进 `event.systemPromptOptions.sections`。取消。

给模型的 Chrome 说明全部写成 `promptGuidelines` 条目：每个工具带默认规则，`guidance.<id>.promptGuidelines` 覆盖；跨工具的规则放 `prompt.guidelines`，`src/index.ts` 在 `before_agent_start` 把它合并进 `systemPromptOptions.promptGuidelines`。两层都是同一个机制，pi 平铺进 `<rules>` 段并去重。

四条理由：

1. pi 自己的内置工具就是「代码里一个 `guidelines` 常量」，不用 sections。照它走最不容易出意外。
2. `promptGuidelines` 只在工具启用时进入系统提示。关掉 `chrome_cdp`，它的规则自动消失。用 sections 得手写过滤。
3. pi 会按原文去重（`buildRules` 里的 `seen` 集合），sections 不会。
4. 少一个模块、两个配置字段、一份「按已注册工具生成文本」的逻辑。

代价：规则是一串 `- ` 条目，不是分段 prose。每条必须点名工具，写起来啰嗦一点。

## 代价

配置是 15 个标量加两个记录。校验与测试多约 80 行。12,000 字符预算只在默认配置下断言；用户自己覆盖后可以超出。

## 不做

不做 `activation: deferred`。兄弟包用它让宿主的 `tool_search` 按需发现工具。本包只有 5 个工具，延迟发现要在会话开始再激活一次，收益不够。
