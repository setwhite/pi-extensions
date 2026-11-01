# error

`errorText` 是唯一的错误转文本点。

- 单独成模块：同一个转换在多个调用点重复，集中后改一次就够。
- 不做类型映射：`ToolError` 的 code、`HerdrHostError` 的 code 由各自的模块决定，这里只出文本。
