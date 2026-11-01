# config

`<data-dir>/config.json` 的唯一读取点。键与语义见契约 §1，默认值与 clamp 边界见 `src/config/index.ts` 与 `test/config/config.test.ts`；本文不复述。

- 只读一次，改完重启 pi：父进程与子进程读到同一份值（DEC-0037）。
- 严格 JSON：未知键、类型错、枚举错让扩展加载失败，并指出字段。拼错键名是错误，静默忽略会让用户以为配置生效。
- 越界数字静默 clamp 到边界：配置在边界上仍然可用，代价是写错数值不会报错。
