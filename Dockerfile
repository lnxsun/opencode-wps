# ============================================================
# OpenCode WPS — NPC Agent 运行环境
# 基于 create-npc-skill 标准模板
# ============================================================
FROM node:22-bookworm-slim

# 安装系统依赖
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates git git-lfs curl jq ripgrep \
    && rm -rf /var/lib/apt/lists/* \
    && git lfs install

# 安装 Node.js CLI 工具（固定版本以保证镜像可复现）
RUN npm install -g @cnbcool/cnb-cli@1.10.17 skills@1.5.21

# 安装 Skills（cnb-skill 已包含 CNB 平台所有交互能力：Issue/PR 评论、API 调用等）
# ⚠️ 切勿安装 cnb-api、cnb-pr-diff 等——它们是运行时内建能力，不是可安装的 git 仓库
RUN npx skills add https://cnb.cool/cnb/skills/cnb-skill.git -g -y
