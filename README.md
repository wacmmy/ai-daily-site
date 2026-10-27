# AI 日报浏览站

每期简报一个 markdown 文件放在 `content/`，`node build.mjs` 生成 `dist/`（零依赖，Node 18+）。

文件名：`content/YYYY-MM-DD-{cn|intl|builders}-HHMM.md`（Builders 早晚各一期：`…-builders-0900.md`、`…-builders-2100.md`）。frontmatter 字段：date, slot, time(可选), type(cn/intl/builders), title(可选), headline, summary, items。正文为简报原文（纯文本即可，网址自动变成链接）。
