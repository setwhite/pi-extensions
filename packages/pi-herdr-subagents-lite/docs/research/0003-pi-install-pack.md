# 0003 pi install 与 pack 产物实测

研究记录；契约见 [v1 契约](../specs/0001-v1-contract.md)。

日期 2026-10-29。环境：pi 1.4.0，Windows + git-bash。每次用新的隔离 `PI_CODING_AGENT_DIR`，只复制真实 `auth.json`；包用 `pnpm pack` 打出的 `pi-herdr-subagents-lite-0.1.0.tgz`。

## 测试 1：`pi install <tarball>`

~~~bash
pi install "$(cygpath -w "$ROOT/pi-herdr-subagents-lite-0.1.0.tgz")" --no-approve
~~~

~~~text
Installing C:\...\pi-herdr-subagents-lite-0.1.0.tgz...
Installed C:\...\pi-herdr-subagents-lite-0.1.0.tgz
~~~

settings 写入 `"packages": ["..\\pi-herdr-subagents-lite-0.1.0.tgz"]`。随后启动会话：

~~~text
Error: Failed to load extension "C:\...\pi-herdr-subagents-lite-0.1.0.tgz":
Failed to load extension: Unknown file extension ".tgz" for C:\...\pi-herdr-subagents-lite-0.1.0.tgz
Hint: Start without extensions using "pi -ne".
~~~

结论：tarball 被当成单个扩展文件，不是包源。

## 测试 2：`pi install npm:<tarball 路径>`

~~~bash
pi install "npm:$(cygpath -w "$ROOT/pi-herdr-subagents-lite-0.1.0.tgz")" --no-approve
~~~

npm 装进 `<agent-dir>/npm/node_modules/pi-herdr-subagents-lite`，`<agent-dir>/npm/package.json` 写作 `"pi-herdr-subagents-lite": "file:../../pi-herdr-subagents-lite-0.1.0.tgz"`；settings 写入 `"packages": ["npm:C:\\...\\pi-herdr-subagents-lite-0.1.0.tgz"]`。会话启动无报错，但 system message 的 `sections.tools` 只有内建工具，`subagent` 未声明：

~~~text
<tools>
- read: Read file contents
- bash: Execute bash commands (ls, grep, find, etc.)
- edit: Make precise file edits with exact text replacement, including multiple disjoint edits in one call
- write: Create or overwrite files
~~~

把 settings 改成 `"packages": ["npm:pi-herdr-subagents-lite"]`（同一份 npm 布局）后，`sections.tools` 出现：

~~~text
- subagent: Start a background subagent in a herdr pane; results arrive asynchronously.
~~~

上面那行是当时的默认工具描述，后来改过；现行文案见 `src/tool/text.ts`。

结论：加载按包名解析 `<agent-dir>/npm`；路径 spec 只完成安装，不完成加载。

## 测试 3：本地 npm 布局

把 tarball 解到发布后的目录形态，settings 按包名声明：

~~~bash
AGENT="$ROOT/agent"
mkdir -p "$AGENT/npm/node_modules/pi-herdr-subagents-lite"
tar -xzf "$ROOT/pi-herdr-subagents-lite-0.1.0.tgz" \
  -C "$AGENT/npm/node_modules/pi-herdr-subagents-lite" --strip-components=1
# settings 加 "packages": ["npm:pi-herdr-subagents-lite"]
~~~

会话的 `sections.tools` 出现 `- subagent`。

结论：这是 `pi install npm:pi-herdr-subagents-lite` 之后的目录形态；本地验证 pack 产物用它。

## 测试 4：解包后 `pi install <目录>`

~~~bash
tar -xzf "$ROOT/pi-herdr-subagents-lite-0.1.0.tgz" -C "$ROOT/pkg"
pi install "$(cygpath -w "$ROOT/pkg/package")" --no-approve
~~~

settings 写入 `"packages": ["..\\pkg\\package"]`。会话的 `sections.tools` 出现 `- subagent`。

结论：local 源可用，但不经过 npm 目录，不作为发布前检查。
