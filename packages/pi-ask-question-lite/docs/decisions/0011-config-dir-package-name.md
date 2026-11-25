# 0011 配置目录改用包名

## 决定

- 配置路径改成 `<agent dir>/pi-ask-question-lite/config.json`，取代 [0010](0010-package-name.md) 留下的 `<agent dir>/pi-ask/config.json`。
- 工具名仍是 `ask`，报错前缀仍是 `pi-ask`。
- 只读这一个位置，不回退读旧目录。

## 为什么

- 其余三个包（`pi-web-search-lite`、`pi-browser-use-lite`、`pi-herdr-subagents-lite`）的配置目录都等于包名，只有 `pi-todo-lite` 用短名 `pi-todo`。`pi-ask` 是包名被占时留下的临时短名，为它得在 README 专门解释「目录名不是包名」。
- 目录跟包名一致后，看 `~/.pi/agent/` 就知道装了什么，README 那句解释可以删掉。

## 代价

- 0.1.1 及更早版本写的配置升级后不生效，要手动挪：`mv ~/.pi/agent/pi-ask ~/.pi/agent/pi-ask-question-lite`。
- 不回退读旧目录：两处都读，配置从哪来就说不清，排查成本高于一次手动挪目录。
