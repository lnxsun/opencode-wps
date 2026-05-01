# opencode-wps 第三轮整改方案

> 基于 DeepSeek 第三轮审查的锦上添花建议

---

## 剩余问题（4 项）

| # | 问题 | 优先级 | 状态 |
|---|------|--------|------|
| 1 | 文件末尾换行符规范 | 低 | 待处理 |
| 2 | Prettier 集成 | 低 | 待处理 |
| 3 | 项目徽章（构建状态） | 低 | 待处理 |
| 4 | 版本号规范化 | 低 | 待处理 |

---

## 整改内容

### 1. 文件末尾换行符

检查并统一所有文本文件以空行结尾：

```bash
# 检查哪些文件没有末尾换行符
find . -type f \( -name "*.js" -o -name "*.ts" -o -name "*.md" -o -name "*.json" \) -exec sh -c '[ -z "$(sed -n \$p "$1")" ] && echo "$1"' _ {} \;
```

---

### 2. Prettier 集成

添加 `.prettierrc` 配置文件：

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

在 `package.json` 中添加格式化命令：

```json
"scripts": {
  "format": "prettier --write .",
  "format:check": "prettier --check ."
}
```

---

### 3. 项目徽章

在 `README.md` 顶部添加构建状态徽章：

```markdown
[![CI](https://github.com/lnxsun/opencode-wps/actions/workflows/ci.yml/badge.svg)](https://github.com/lnxsun/opencode-wps/actions)
[![Version](https://img.shields.io/github/v/release/lnxsun/opencode-wps)](https://github.com/lnxsun/opencode-wps/releases)
```

---

### 4. 版本号规范化

在 `package.json` 中使用语义化版本：

```json
{
  "version": "1.1.0",
  "private": true
}
```

---

## 实施顺序

| 序号 | 任务 | 工作量 |
|------|------|--------|
| 1 | 添加 .prettierrc + format 脚本 | 0.5h |
| 2 | 统一文件末尾换行符 | 0.5h |
| 3 | 添加 README 徽章 | 0.5h |
| 4 | 规范化版本号 | 0.5h |

**总计**：约 2 小时