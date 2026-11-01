# 0058 profile 名 = frontmatter name

profile 名只取 frontmatter `name`，必填，去首尾空白后不能为空；文件名不参与寻址。guidelines 与 `run` 都用这个名字。同一层两个文件同名时两个都不加载；项目层与全局层同名仍由项目覆盖（DEC-0042）。

依据：用户要求 profile 只有一个名字，避免文件名与显示名两套。示例文件名与 `name` 都是 `domain`（DEC-0057）。
