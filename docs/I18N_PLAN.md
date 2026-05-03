# 国际化 (i18n) 支持规划

> 状态：未来规划，暂不实施
> 创建时间：2026-05-01
> 背景：DeepSeek review 建议考虑英文支持以服务更广泛用户

---

## 当前状态

- UI 界面：中文
- Agent 提示词：中文
- 文档：中文为主
- 目标用户：中文 WPS 用户

---

## 实施规划

### 阶段 1：UI 国际化（优先级：低）

#### 1.1 创建语言文件

```
opencode-wps/
├── locales/
│   ├── zh-CN.json      # 中文
│   ├── en-US.json      # 英文
│   └── index.js        # 语言加载器
```

#### 1.2 语言文件格式示例

```json
{
  "btn_start": "启动服务",
  "btn_stop": "停止服务",
  "status_running": "运行中",
  "status_stopped": "已停止",
  "agent_wps_expert": "WPS 专家",
  "chat_placeholder": "输入消息..."
}
```

#### 1.3 修改 taskpane.html

```javascript
// 当前（硬编码中文）
$btnStart.textContent = '启动服务';

// 未来（语言切换）
var lang = getPS('opencode_lang') || 'zh-CN';
loadLocale(lang).then(function(t) {
    $btnStart.textContent = t.btn_start;
});
```

### 阶段 2：Agent 提示词国际化（优先级：低）

#### 2.1 创建多语言 Agent 目录

```
agents/
├── zh-CN/
│   ├── wps-expert.md
│   ├── wps-word.md
│   ├── wps-excel.md
│   └── wps-ppt.md
├── en-US/
│   ├── wps-expert.md
│   ├── wps-word.md
│   ├── wps-excel.md
│   └── wps-ppt.md
```

#### 2.2 安装脚本适配

修改 `install-addons.js` 支持语言参数：

```bash
node install-addons.js --lang en-US
```

### 阶段 3：文档国际化（优先级：低）

#### 3.1 文档目录结构

```
docs/
├── zh-CN/
│   ├── README.md
│   ├── DEVELOPMENT_GUIDE.md
│   └── ...
├── en-US/
│   ├── README.md
│   ├── DEVELOPMENT_GUIDE.md
│   └── ...
```

---

## 实施考虑

### 技术限制

1. **WPS 内置浏览器兼容性**
   - 需保持 ES5 语法
   - 不能使用现代 i18n API（Intl.*）
   - 建议用简单的 JSON 翻译文件

2. **Agent 提示词工作量**
   - 4 个 Agent，每个约 200-500 行
   - 需要专业翻译或 AI 辅助
   - 提示词质量直接影响 AI 效果

### 优先级评估

| 项目 | 当前优先级 | 原因 |
|------|----------|------|
| UI i18n | 低 | 中文用户为主，WPS 中国市场大 |
| Agent i18n | 低 | 提示词翻译成本高，需保证质量 |
| 文档 i18n | 低 | 可通过社区贡献逐步完善 |

---

## 决策

**暂不实施 i18n**，原因：
1. 项目主要服务中文 WPS 用户
2. WPS Office 在中国市场占有率更高
3. 开发资源应优先投入核心功能
4. 如需英文支持，可通过 GitHub 社区贡献

---

## 未来触发条件

当满足以下条件时，可考虑启动 i18n：
- [ ] 项目 star 数 > 500
- [ ] 收到 3+ 个英文用户请求
- [ ] 有社区成员愿意维护英文版本
- [ ] 核心功能稳定，有空闲开发资源

---

## 参考资料

- [W3C Internationalization](https://www.w3.org/International/)
- [i18next](https://www.i18next.com/)（现代方案，WPS 暂不支持）
- [简单 i18n 实现](https://github.com/i18next/i18next)