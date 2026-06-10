# Skills 目录说明

## 目录结构

```
skills/           ← 源文件（此目录，被 git 跟踪）
    wps-excel/           # Excel 数据处理技能
    wps-word/            # Word 文档操作技能
    wps-ppt/             # PPT 演示文稿技能
    wps-office/          # WPS 通用技能
    wps-proofread/       # 文档校对技能（P1-P16 严格逐批校验）

↓ 安装后复制到 ↓

~/.opencode/skills/   ← OpenCode 实际加载的位置（不被 git 跟踪）
```

## 修改流程（重要！）

1. **只修改此目录**（`skills/`）中的文件
2. **不要直接修改** `~/.opencode/skills/` 中的文件
3. 修改后运行：`node install-addons.js` 同步到用户目录
4. 提交到 git：`git add skills/ && git commit -m "..."`

## AI 编程助手注意事项

如果你是一个 AI 助手，正在帮助修改 skills：
- ✅ 修改 `D:\code\opencode-wps\skills\` 下的文件
- ✅ 修改后提醒用户运行 `node install-addons.js`
- ✅ 修改后提交到 git
- ❌ 不要直接修改 `~/.opencode/skills\` 下的文件
- ❌ 不要只改不提交

## 验证同步状态

```bash
# 对比源文件和安装后的文件
diff -r skills/ ~/.opencode/skills/
```
