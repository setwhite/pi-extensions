# 0004 herdr workspace create 实测

研究记录；当前契约见 [v1 契约](../specs/0001-v1-contract.md)，决策见 [DEC-0022](../decisions/0022-tab-placement.md)。

日期 2026-10-29。环境：herdr 0.9.5，Windows + git-bash，protocol 22。在隔离 named session `probe-t32` 里跑，跑完 `server stop` 与 `session delete`。

## 命令与输出

~~~bash
herdr --session probe-t32 workspace create --cwd "$PWD" --label probe --no-focus
~~~

省略 `scroll`、`terminal_id`、`revision` 字段：

~~~json
{"id":"cli:workspace:create","result":{
  "workspace":{"active_tab_id":"w1:t1","label":"probe","number":1,"pane_count":1,"tab_count":1,"workspace_id":"w1"},
  "tab":{"focused":true,"label":"1","number":1,"pane_count":1,"tab_id":"w1:t1","workspace_id":"w1"},
  "root_pane":{"cwd":"C:\\Users\\Charles Liu\\Desktop\\herdr探索\\","focused":true,"pane_id":"w1:p1","tab_id":"w1:t1","workspace_id":"w1"}
}}
~~~

~~~bash
herdr --session probe-t32 tab create --workspace w1 --cwd "$PWD" --label probe-tab --no-focus
~~~

~~~json
{"id":"cli:tab:create","result":{
  "tab":{"focused":false,"label":"probe-tab","number":2,"pane_count":1,"tab_id":"w1:t2","workspace_id":"w1"},
  "root_pane":{"cwd":"C:\\Users\\Charles Liu\\Desktop\\herdr探索\\","focused":false,"pane_id":"w1:p2","tab_id":"w1:t2","workspace_id":"w1"}
}}
~~~

## 结论

1. `workspace create` 一次建 workspace、初始 tab 与 root pane；workspace id 在 `result.workspace.workspace_id`。
2. 初始 tab 的 label 是序号（`"1"`），不是 `--label` 的值；`--label` 只设 workspace label。
3. `tab create --workspace <id>` 在该 workspace 追加 tab，tab 编号接着 workspace 内已有 tab（`w1:t2`）。
4. `--no-focus` 对 workspace 与 tab 都生效：`tab create` 返回的 root pane `focused: false`。

## 追加实测（2026-10-31）

环境同上：herdr 0.9.5，Windows + git-bash，protocol 22。隔离 named session `probe-t33`，跑完 `server stop` 与 `session delete`。

```bash
herdr --session probe-t33 workspace create --cwd "$PWD" --label probe --env PI_SUBAGENT_AUTO_EXIT=1 --no-focus
```

命令成功，返回 `workspace` / `tab` / `root_pane` 三个对象；初始 tab 的 label 仍是序号 `"1"`，root pane 是 `w1:p1`。`--env` 生效：在初始 pane 里执行 `cmd /c echo AUTOEXIT=%PI_SUBAGENT_AUTO_EXIT%`，输出 `AUTOEXIT=1`。

```bash
herdr --session probe-t33 tab close w1:t1
herdr --session probe-t33 workspace list
```

```json
{"id":"cli:tab:close","result":{"type":"ok"}}
{"id":"cli:workspace:list","result":{"type":"workspace_list","workspaces":[]}}
```

结论：

5. `workspace create` 支持 `--env`，并作用于初始 pane。
6. 关掉 workspace 的最后一个 tab 后，该 workspace 从 `workspace list` 消失。

## 补充：`agent prompt` 对首轮不可靠

实测 2026-10-31，同一批 6 个子代理，brief 都通过 `agent prompt <name> @<childSession>.brief.md` 投递：

- domain-1/2/3/4/6 的 session 里出现这条 user 消息，内容就是 `@C:\Users\Charles Liu\…\<childSession>.brief.md`（纯文本，不是附件）。
- domain-5 的 session 里没有这条消息：`session` 05:19:33 建好、05:19:36 选好模型，之后空 5 分 43 秒，直到 05:25:16 一条 inbox 消息才起第一轮。brief 文本留在 pane 的输入框里，`agent prompt` 没有报错。

结论：

7. `agent prompt` 是键盘级投递：打字进输入框再按一次 Enter，没有回执。`@` 是文件 mention，补全列表会吃掉这个 Enter；路径含空格时更不稳定。
8. 父侧因此不能把「任务是否送达」交给这条通道：run 仍记为 live，轮询看到 `idle` 且 `completion_seq` 为 0，什么也不做。

## 补充：`agent start` 等到 idle 才算就绪

实测 2026-10-31，herdr 0.9.5 + pi 1.4.0，用 inbox 让子代理第一拍就开局：

- 第一轮短（10.6s）：`agent start` rc=0，但它是在这一轮结束、子代理回到 idle 时才返回，不是子代理一上线就返回。
- 第一轮长（40s）：`agent start` 20s 上限到时返回 `{"error":{"code":"timeout","message":"timed out waiting for agent startup"}}`，此时子代理正在 working。
- 对照：没有 inbox 消息的空闲 pi，`agent start` 4.98s 返回 `interactive_ready=true`。

结论：

9. `agent start` 的就绪判定是「agent 处于 idle」，不是「进程已起」。先投 brief 再 start 会把启动等待变成首轮时长。
10. 正确顺序：`createInbox` → `agent start` → `enqueue(@brief)`。目录必须先建，否则子代理侧的泵不启动。
