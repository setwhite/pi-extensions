# ledger

`browser-extension/background/ledger.js`

## 取舍

- 一个键同时写 `storage.session` 与 `storage.local`，读时先 session 再 local：session 随扩展重载清空，local 留着，所以热重载后还能认回上一次的台账。代价是 local 里的记录可能很旧，靠浏览器启动时整份作废兜底。
- 写与删都覆盖两处：只清一处会让下次读回已被删掉的记录。
- 按前缀取值与作废都扫两处存储并按键去重：同一个键在两处都有时只能算一次。
- 作废按前缀整批删，不逐个查：键集合本来就来自这一次扫描。
