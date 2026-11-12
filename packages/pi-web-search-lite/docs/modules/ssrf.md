# ssrf/ — 静态 SSRF 守卫

发请求前的字面量 URL 判定：协议、主机名、字面量 IP。**不解析 DNS、不发任何请求、不 import 宿主包**。

判定清单与错误类型在 `src/ssrf/index.ts`，逐条断言在 `test/ssrf.test.ts`。本文不复述。回环判定另有一套更窄的规则，供 `src/http/` 决定绕过代理，与封禁范围不同。见 `isLoopbackHost` 的注释与 [DEC-0004](../decisions/0004-single-proxy-setting.md)。

## 明确不做

DNS 解析、DNS rebinding 检测（[DEC-0007](../decisions/0007-truncate-and-spill.md)）。主机名解析到私网的场景，本模块放行。这条是安全边界，不是遗漏。
