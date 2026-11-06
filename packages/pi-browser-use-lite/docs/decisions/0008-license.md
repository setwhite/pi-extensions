# 0008 许可证与作者

## 问题

本包从 pi-chrome（MIT）删减而来。LICENSE 怎么署名，要不要 NOTICE。

## 选了

MIT。作者 `setwhite`。不建 NOTICE。

## 做法

`LICENSE` 文件保留上游的版权行，再加一行自己的：

```
MIT License

Copyright (c) 2024-2026 pi-chrome contributors
Copyright (c) 2026 setwhite
```

`package.json` 里 `"author": "setwhite"`、`"license": "MIT"`，与兄弟包一致。

## 理由

MIT 要求保留原版权声明。两行并列就满足，不需要额外文件。NOTICE 是 Apache-2.0 的概念，MIT 没有这个要求。

作者名与兄弟包 `pi-web-search-lite` 保持一致，避免发布时出现两个署名。
