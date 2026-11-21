# 0069 profile 未知字段报错

profile frontmatter 里出现不认识的键，该 profile 不加载，`run` 返回 `profile_invalid` 并指出字段。取代 DEC-0042 里「未知字段忽略」一句。

## 为什么

拼错 `auto_exit`（正确是 `auto-exit`）既不报错也不生效：子代理不自动关，槽位一直被占，父代理撞到 `max_concurrent` 才知道有问题，还看不出原因。`config` 早就是未知键报错，profile 没理由更宽松。

## 代价

- 破坏性：混了别的工具字段的老 profile 升级后直接不加载，用户得改一行。
- 字段名单有两处：契约 §2 与 `src/profile/frontmatter.ts` 的 `PROFILE_KEYS`。加字段要同时改。
