# 0072 待答问题落 questions.json，不靠 turn_end 让位

子代理调用 `request_input` 提问后，父代理仍要能把它当「提问」而不是「完成」结算。

## 为什么

`request_input` 写 `result.json`（`state: "needs_input"`）后，工具结果会让模型再跑一个回合。这个回合结束时 `turn_end` 又写一次 `result.json`，把 `needs_input` 盖成 `turn_end` —— 真机 e2e 里直接复现：seq 1 是 `needs_input`，seq 2 变成 `turn_end: "Ending turn."`，父代理于是按完成结算，问题静默丢失。

只跳过「本回合工具结果里有 `request_input` 的那次 `turn_end`」不够：真正覆盖它的是后面的续写回合。

## 规则

- `request_input` 同时写 `<run 目录>/questions.json`，与 `result.json` 一样原子替换。
- `turn_end` 落盘时若 `questions.json` 还在，仍写 `needs_input` 并带上问题；文本照常写入。
- 父代理在把答案 steer 回去之前删掉 `questions.json`，下一次 `turn_end` 才写回 `turn_end`。
- 提问后子代理继续跑多个回合也无所谓：状态一直是 `needs_input`，问题不丢。

## 代价

- run 目录多一个文件；`request_input` 与 `turn_end` 两条写入路径都要读它。
- 父代理删文件与子代理写文件之间没有锁：答案投递前删除，子侧下一回合才写，实际不会撞上。

## 否决的替代

- 子侧记住「本回合已提问」的进程内状态：父代理删不掉，下一轮提问就再也写不进去。
- 父侧按 `toolResults` 判重：只在同一条 `turn_end` 内有效，续写回合没有工具结果。
- 只保留 `result.json` 并让父侧读历史 seq：单文件被覆盖后历史不可恢复。
