# CNB 平台反馈单：codewiki 插件 LLM 接入认证缺陷（401 / 空响应）

> 用途：面向 CNB 平台（cnb.cool）的缺陷反馈单，供平台侧 codewiki 插件（`cnbcool/codewiki`）维护者定位与修复。关联 Issue：[#117 生成wiki](https://cnb.cool/lnxsun/opencode-wps/-/issues/117)。
> 状态：**提交待平台侧处理**。本单由仓库侧（`lnxsun/opencode-wps`）在完成全部仓库侧配置与诊断后整理，证据来自真实构建日志。

> **2026-08-23 更新**：经核实，平台侧将 codewiki 插件默认 LLM 模型切换为 **`deepseek-v4-flash`（免费模型，不消耗 AI 积分）**。此前多次 Wiki 生成失败的另一根因（平台 AI 积分用尽）因此可被规避。仓库侧已同步在 `.cnb.yml` 的 codewiki 配置中显式指定 `llm_model_name: deepseek-v4-flash`，重新打 tag 即可触发 Wiki 生成。

> **2026-08-24 复测（Issue #117 / #204 相关）**：docs/ 已改写为 CNB blob 绝对链接并合并（PR #205），仓库知识库已同步（114 chunks）。重新触发 codewiki 生成，**两个接入点（`use_codebuddy=0` 与 `use_codebuddy=1`）仍全部失败**，症状与 2026-08-23 完全一致——`LLM响应中未找到有效的Action标签, LLM响应预览: (空)` 持续约 3 分钟，随后 `agent.run() 返回空内容`，`wiki_status.json` 记录 `status: failed`，`exit code: 1`。工作区挂载与 docs/ 读取均正常（预检 `ENTRY_COUNT=34~37`、README 已正确复制），排除仓库侧问题。
>
> 构建容器内（与插件同环境）手工调用端点复测（`CNB_API_ENDPOINT=https://api.cnb.cool`、`CNB_TOKEN` 27 位）：
> - `POST /-/ai/chat/completions`（use_codebuddy=0）→ **HTTP 404** `errcode:5 "Resource not found."`
> - `POST /-/ai-ide/v2/chat/completions`（use_codebuddy=1）→ **HTTP 404** `errcode:5 "Resource not found."`
>
> 即：当前 LLM 接入端点对流水线临时令牌仍不可用（此前 401 `errcode:16`，现 404 `errcode:5`），导致 codewiki 插件拿不到任何 LLM 响应。需平台侧修复后，仓库重新打 tag 才能自动生成 Wiki。

---

## 1. 问题现象

仓库配置 CNB **Code Wiki（codewiki 插件）** 后，打 tag 触发 `tag_push` 流水线，`generate codewiki` stage **全部失败**，导致仓库 `/-/wikis` 页面长期显示 **"Page not found / 暂无"**（Wiki 从未成功生成）。

涉及版本（每次发布均触发失败）：

| Tag | 构建 SN | 结果 |
|-----|---------|------|
| v1.3.1 / v1.4.0 | `cnb-dgg-1k00chk5p` 等 | ❌ 失败 |
| v1.5.1（官方推荐配置） | `cnb-o18-1k00dnf0f` | ❌ 失败 |

## 2. 典型失败日志（v1.5.1，`cnb-o18-1k00dnf0f`）

```
use llm proxy client
2026-08-14 23:20:11 - codewiki.core.action_manager - ERROR - [action_manager.py:137]
  - LLM响应中未找到有效的Action标签, LLM响应预览: (空)      ← 反复约 2 分钟全为空
...（同上重复约 30 次）...
2026-08-14 23:23:08 - codewiki.doc_manage.catalogue_gen - ERROR - [catalogue_gen.py:73]
  - analyze_repository_structure_agent: agent.run() 返回空内容，
    大概率是 LLM 在 max_turns 内未给出合法 attempt_completion。返回空目录。
error_msg: generate catalogue error: agent returned empty catalogue items
exit code: 1
```

## 3. 根因定位

- 该构建使用 **codewiki 插件官方 README 推荐配置**：
  ```yaml
  use_codebuddy: 0                # 使用 CNB AI 接入点
  llm_model_name: 'hy3-preview'   # 插件 README 示例模型
  git_doc_dir: /${CNB_BUILD_WORKSPACE}/${CNB_REPO_SLUG}/codewiki
  knowledge_enabled: true
  ```
- **连官方推荐配置都拿不到任何 LLM 响应**（`LLM响应预览: (空)`），说明问题不在仓库配置，而在 **codewiki 插件调用 LLM 端点时的认证环节**。
- 在构建容器内（与插件相同环境）实测：
  - `use_codebuddy: 0` 端点 `/-/ai/chat/completions` → **401** `errcode:16 "user is not logged in"`
  - `use_codebuddy: 1` 端点 `/-/ai-ide/v2/chat/completions` → **401** `errcode:16 "user is not logged in"`
  - `Authorization: Bearer $CNB_TOKEN` / `x-cnb-token: $CNB_TOKEN` → 均 401
  - `CNB_TOKEN`（27 位）确认已注入容器、`CNB_API_ENDPOINT=https://api.cnb.cool` 正常。

## 4. 预期修复

请平台侧在 **codewiki 插件（`cnbcool/codewiki`，镜像 `latest`）** 上：
1. 升级对当前 CNB LLM 接入 / 认证机制的兼容（消除 401 / 空响应）；
2. 或在插件容器内正确透传当前可用的仓库/构建认证凭据；
3. 插件镜像更新后，仓库重新打 tag（如 `v1.5.2`）即可自动触发 Wiki 生成，无需再改任何仓库配置。

## 5. 仓库侧已就绪（供复核）

- 文档增强至 Wiki 级（使用/开发双主线）→ PR #118 已合并。
- `.cnb.yml` codewiki 配置（`tag_push` + `git_doc_dir` + `use_codebuddy:0` + `knowledge_enabled:true`）→ PR #127 / #129 已合并。
- 知识库入库（`docs/`，98 chunks / 1.58MB）已生效。
- 排障文档（「CNB Code Wiki 生成失败排查」）→ PR #131 已合并。
- 发布 v1.5.0 / v1.5.1（四要素）已落地。

> ⚠️ 仓库侧在平台修复前**不伪造**"Wiki 已生成"、不擅自打无意义的 tag；此问题为平台侧外部依赖，非仓库代码可修复。
