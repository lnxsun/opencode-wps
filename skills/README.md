# Skills 目录说明

## 目录结构

```
skills/           ← 源文件（此目录，被 git 跟踪）
    wps-excel/           # Excel 数据处理技能
    wps-word/            # Word 文档操作技能
    wps-ppt/             # PPT 演示文稿技能
    wps-office/          # WPS 通用技能
    wps-proofread/       # 文档校对技能（严格逐批校验；执行守卫交由治理插件，见 Issue #309 / #325）

↓ 安装后复制到 ↓

~/.opencode/skills/   ← OpenCode 实际加载的位置（不被 git 跟踪）
```

## 单一来源 docs 派生

`wps-proofread/SKILL.md` 不再引用任何 `docs/xxx.md` 设计文档（校对设计/导航文档已随 Issue #325
的批量冗余清理删除：SKILL.md 本身就是 AI 的操作契约，第二份叙述型文档只会与实现漂移）。
派生机制（`scripts/lib/derive-skill-docs.js` + `npm run validate:skill-docs`）对没有 docs 引用的
skill 为空操作，保留以备将来重新引入设计文档。

## skill 与治理插件的关系

`skills/` 内的 SKILL.md 是**给 AI 读的执行契约**，本身**不做任何校验**；真正的「强制拦截」在
`.opencode/plugins/governance.js`（治理插件，随 OpenCode 运行、经 `tool.execute.before` 钩子生效）。
`skills/wps-proofread/SKILL.md` 末尾的「执行守卫」节只是治理行为的**下游说明**：

- 拦截必然发生，与 skill 是否被加载、是否读过该节**无关**；
- 实现事实源是 `governance.js` 源码（仅 P1-P4 四条校对规则），语义说明见 `docs/FEATURES.md`。

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
# 对比源文件和安装后的文件（若存在安装期派生的 docs/ 子目录，加 --exclude=docs）
diff -r --exclude=docs skills/ ~/.opencode/skills/
```
