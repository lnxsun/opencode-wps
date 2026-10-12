// ========================================
// WPS 加载项 - OpenCode 集成
// ========================================

var OPENCODE_PORT = 14096;
var OPENCODE_HOST = '127.0.0.1';
var OPENCODE_API_BASE = 'http://' + OPENCODE_HOST + ':' + OPENCODE_PORT;
var LAUNCHER_API = 'http://' + OPENCODE_HOST + ':14097';

var OPENCODE_STATE = 'stopped';
var OPENCODE_ERROR = '';
var isProcessingCommand = false;

var WPS_Enum = {
  msoCTPDockPositionLeft: 0,
  msoCTPDockPositionRight: 2,
  msoFileDialogFolderPicker: 4,
  msoFileDialogOpen: 1,
};

// 任务窗格停靠位置（右侧，避免遮挡 WPS 顶部标签页：开始/插入等）
// 说明：停靠方向值直接取 WPS_Enum.msoCTPDockPositionRight（=2），
// 不新增 Top/Bottom 枚举 —— 其值（1/3）会与已有 msoFileDialogOpen(1) 冲突埋雷
var TASKPANE_DOCK_POSITION = WPS_Enum.msoCTPDockPositionRight;

// 内存 ID 兜底：PluginStorage.setItem 持久化失败（如插件初始化未完成）时，
// 本次会话内仍能避免再次点击重复 CreateTaskPane 造成多窗格叠加；
// WPS 重启后随插件内存清空，由 PluginStorage 持久化值接管（见文档注意事项第 10 条）
var taskpaneIdCache = '';

/**
 * 统一提取异常信息：e 可能是 Error 对象（取 .message），也可能是字符串等任意值
 * @param {*} e - try/catch 捕获的异常
 * @returns {*} 可读的错误描述（Error 取 .message，非 Error 值原样返回）
 */
function errMsg(e) {
  return e && e.message ? e.message : e;
}

/**
 * 校正任务窗格停靠位置（右侧），避免遮挡 WPS 顶部标签页（开始/插入等）
 * CreateTaskPane 仅传 url 单参数（官方签名稳妥用法），创建后通过
 * DockPosition 属性显式校正；每次打开/切换时也重新校正，防止位置漂移。
 * @param {object} tskpane - 任务窗格对象
 * @returns {boolean} true=设置成功；false=设置失败（已 console.error 留痕）
 */
function setTaskPaneDockPosition(tskpane) {
  if (!tskpane) {
    console.error('[WPS] setTaskPaneDockPosition: 无效的任务窗格对象');
    return false;
  }
  try {
    tskpane.DockPosition = TASKPANE_DOCK_POSITION;
    return true;
  } catch (e) {
    console.error('[WPS] 设置任务窗格停靠位置失败: ' + errMsg(e));
    return false;
  }
}

/**
 * 创建任务窗格并统一初始化：CreateTaskPane（单参数）→ 存 taskpane_id →
 * 校正停靠位置（右侧）→ 置可见。首次创建与 GetTaskPane 判空回退重建共用。
 * @returns {object} 创建并初始化好的任务窗格对象
 */
function createTaskPane() {
  try {
    var tskpane = window.Application.CreateTaskPane(GetUrlPath() + '/taskpane.html');
    // CreateTaskPane 个别版本可能返回 null（而非抛异常）：立即判空并给出明确留痕，
    // 避免后续 tskpane.ID 抛误导性的 TypeError（外层 catch 虽能兜住，但
    // 「初始化任务窗格失败」文案会把排查方向带偏到创建/存 ID/校正/置位全流程）
    if (!tskpane) {
      console.error('[WPS] 创建任务窗格失败: CreateTaskPane 返回空对象');
      return null;
    }
    // 内存 ID 兜底：无论 setItem 成败，先记录本次会话内有效 ID，
    // 避免持久化失败后再次点击重复 CreateTaskPane 造成多窗格叠加；
    // ID 为空（个别版本未回填）时留痕但不覆盖既有缓存，避免内存兜底失效
    if (tskpane.ID) {
      taskpaneIdCache = tskpane.ID;
      // setItem 与 getItem 同源同概率抛异常（如插件初始化未完成），单独 try/catch 留痕后继续：
      // 避免中断导致下方 DockPosition 校正与 Visible 置位被跳过（窗格创建了却永远不显示）；
      // 仅 ID 有效时才持久化——ID 为空时跳过写入，避免 setItem 持久化 undefined 覆盖既有有效 ID
      try {
        window.Application.PluginStorage.setItem('taskpane_id', tskpane.ID);
      } catch (e) {
        console.error('[WPS] 保存 taskpane_id 失败: ' + errMsg(e));
      }
    } else {
      console.error('[WPS] 任务窗格 ID 为空，内存兜底可能失效');
    }
    // 停靠校正失败（setTaskPaneDockPosition 内部已留痕）但窗格仍可用：
    // 不中断、继续置可见并返回窗格对象——下次点击经 GetTaskPane 找回后重新校正，
    // 有自愈机会；此处补充「窗格可用」留痕，使调用方可感知该状态（评审 ②）
    if (!setTaskPaneDockPosition(tskpane)) {
      console.error('[WPS] 任务窗格停靠校正失败（窗格仍可用，下次点击将重新校正）');
    }
    // Visible 置位单独 try/catch：窗格已创建、ID 已兜底，失败时留痕后仍返回窗格对象，
    // 保留下次点击自愈机会（GetTaskPane 能找回 → 重新校正 + 切换可见性）；
    // 若在此处 return null 会触发调用处误判「创建失败」，且无自愈路径
    try {
      tskpane.Visible = true;
    } catch (e) {
      console.error('[WPS] 置任务窗格可见失败: ' + errMsg(e));
    }
    // 二次校正停靠位置（Issue #164）：WPS 文字（12.1.0.28022）在 Visible=true 时会
    // 重新计算任务窗格窗口位置，把顶边定位到标题栏正下方（覆盖「开始/插入」功能区），
    // 从而覆盖掉上方设置的 DockPosition=Right（PPT/Excel 无此行为，故仅 WPS 文字出问题）。
    // 因此在置可见【之后】再校正一次停靠位置，把被宿主覆盖的正确停靠纠正回来。
    // 失败（内部已留痕）不影响返回：下次点击经 GetTaskPane 找回后仍会重新校正，有自愈机会。
    setTaskPaneDockPosition(tskpane);
    return tskpane;
  } catch (e) {
    // 该 try 块涵盖 CreateTaskPane / 存 ID / DockPosition 校正 / Visible 置位全流程，
    // 任一步失败都会走到这里，文案用「初始化」更准确（避免误以为只是创建步骤失败）。
    // 注意：Visible 置位已内层 try/catch 兜底不会走到这里，此处实际仅兜 CreateTaskPane 本身失败
    console.error('[WPS] 初始化任务窗格失败: ' + errMsg(e));
    return null;
  }
}

// --- WPS 就绪检查 ---
/**
 * 检查 WPS Application 是否就绪
 * @returns {boolean} true 表示 WPS 可用
 */
function checkWpsReady() {
  try {
    if (!window.WPS || !window.WPS.Application) {
      console.error('[WPS] WPS 未就绪');
      return false;
    }
    return true;
  } catch (e) {
    console.error('[WPS] 检查失败: ' + errMsg(e));
    return false;
  }
}

/**
 * 获取当前活动文档（支持文字/表格/演示）
 * @returns {object|null} 活动文档对象，无文档时返回 null
 */
function checkDocument() {
  try {
    var app = window.WPS && window.WPS.Application;
    if (!app) {
      // 某些 WPS 版本中窗口回调只能通过 window.Application 访问
      app = window.Application;
      if (!app) return null;
    }
    // WPS 文字 / 表格 / 演示使用不同的 Active 属性
    var doc = app.ActiveDocument || app.ActiveWorkbook || app.ActivePresentation;
    if (!doc) {
      console.warn('[WPS] 请先打开文档');
      return null;
    }
    return doc;
  } catch (e) {
    console.error('[WPS] 文档检查失败: ' + errMsg(e));
    return null;
  }
}

/**
 * 获取插件安装路径
 * @returns {string} 归一化的路径（正斜杠）
 */
function GetUrlPath() {
  var pluginPath = '___WPS_ADDON_PATH___';
  return pluginPath.replace(/\\/g, '/');
}

var lastDocInfo = '';

/**
 * 将当前文档信息推送到 launcher 缓存
 * 每 500ms 轮询调用，文档未变化时自动跳过
 */
function sendDocInfo() {
  try {
    var app = window.WPS && window.WPS.Application;
    if (!app) app = window.Application;
    if (!app) return;
    var doc = app.ActiveDocument || app.ActiveWorkbook || app.ActivePresentation;
    if (!doc) {
      // 无文档打开时清除缓存，避免 MCP fallback 返回过期数据
      if (lastDocInfo !== '') {
        lastDocInfo = '';
        var clearXhr = new XMLHttpRequest();
        clearXhr.open('POST', LAUNCHER_API + '/docinfo', true);
        clearXhr.setRequestHeader('Content-Type', 'application/json');
        clearXhr.send(JSON.stringify({ closed: true }));
      }
      return;
    }
    var info = {
      name: doc.Name,
      path: doc.FullName,
      type: app.ActiveDocument ? 'word' : app.ActiveWorkbook ? 'excel' : 'ppt',
    };
    if (app.ActiveDocument) {
      try {
        info.paragraphCount = doc.Paragraphs.Count;
      } catch (e) {}
      try {
        info.wordCount = doc.Words.Count;
      } catch (e) {}
    }
    var key = JSON.stringify(info);
    if (key === lastDocInfo) return;
    lastDocInfo = key;
    var xhr = new XMLHttpRequest();
    xhr.timeout = 3000;
    xhr.open('POST', LAUNCHER_API + '/docinfo', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(key);
  } catch (e) {
    console.warn('[OpenCode] sendDocInfo failed: ' + errMsg(e));
  }
}

/**
 * 设置 OpenCode 运行状态
 * @param {string} state - 状态值：stopped / running / error
 * @param {string} [error] - 错误描述
 */
function setOpenCodeState(state, error) {
  OPENCODE_STATE = state;
  OPENCODE_ERROR = error || '';
  try {
    window.Application.PluginStorage.setItem('opencode_state', state);
    window.Application.PluginStorage.setItem('opencode_error', error || '');
    window.Application.PluginStorage.setItem('opencode_api_base', OPENCODE_API_BASE);
  } catch (e) {}
  console.log('[OpenCode] State: ' + state + (error ? ' Error: ' + error : ''));
}

/**
 * 启动 OpenCode 服务进程
 * @param {string} cwd - 工作目录
 */
function startOpenCodeServer(cwd) {
  if (!cwd) {
    isProcessingCommand = false;
    return;
  }
  try {
    window.Application.PluginStorage.setItem('opencode_cwd', cwd);
  } catch (e) {}
  var data = JSON.stringify({ cwd: cwd });
  console.log('[OpenCode] Sending: ' + data);
  var xhr = new XMLHttpRequest();
  xhr.timeout = 10000;
  xhr.open('POST', LAUNCHER_API + '/start', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      console.log('[OpenCode] Launcher response: ' + xhr.status + ' ' + xhr.responseText);
      isProcessingCommand = false;
    }
  };
  xhr.onerror = function () {
    console.log('[OpenCode] Cannot reach launcher');
    isProcessingCommand = false;
  };
  xhr.ontimeout = function () {
    console.log('[OpenCode] Launcher timeout');
    isProcessingCommand = false;
  };
  try {
    xhr.send(data);
  } catch (e) {
    console.log('[OpenCode] Send error: ' + errMsg(e));
    isProcessingCommand = false;
  }
}

/**
 * 停止 OpenCode 服务进程
 */
function stopOpenCodeServer() {
  var xhr = new XMLHttpRequest();
  xhr.timeout = 5000;
  xhr.open('POST', LAUNCHER_API + '/stop', true);
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      console.log('[OpenCode] Stop: ' + xhr.status);
      isProcessingCommand = false;
    }
  };
  xhr.onerror = function () {
    isProcessingCommand = false;
  };
  xhr.ontimeout = function () {
    isProcessingCommand = false;
  };
  try {
    xhr.send();
  } catch (e) {
    isProcessingCommand = false;
  }
  setOpenCodeState('stopped');
}

/**
 * 检查 OpenCode 服务健康状况
 */
function checkServerHealth(callback) {
  var xhr = new XMLHttpRequest();
  xhr.timeout = 3000;
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) callback(xhr.status === 200);
  };
  xhr.onerror = function () {
    callback(false);
  };
  xhr.ontimeout = function () {
    callback(false);
  };
  try {
    xhr.open('GET', OPENCODE_API_BASE + '/global/health', true);
    xhr.send();
  } catch (e) {
    callback(false);
  }
}

/**
 * 连接 OpenCode Chat API
 * @param {string} cwd - 工作目录
 * @param {string} sessionId - 会话标识
 */
function connectOpenCode() {
  if (OPENCODE_STATE === 'running') {
    isProcessingCommand = false;
    return;
  }
  setOpenCodeState('connecting');
  checkServerHealth(function (isRunning) {
    setOpenCodeState(isRunning ? 'running' : 'stopped');
    isProcessingCommand = false;
  });
}

function OnAddinLoad(ribbonUI) {
  if (typeof window.Application.ribbonUI !== 'object') window.Application.ribbonUI = ribbonUI;
  if (typeof window.Application.Enum !== 'object') window.Application.Enum = WPS_Enum;
  connectOpenCode();
  return true;
}

function getControlId(control) {
  // WPS 不同版本/回调中 Id 属性大小写不一致（control.Id vs control.id）
  return control.Id || control.id;
}

function OnAction(control) {
  var eleId = getControlId(control);
  switch (eleId) {
    case 'btnShowTaskPane':
      var tsId = '';
      // PluginStorage 在插件初始化未完成等场景可能抛异常，与其他 getItem 调用保持 try/catch 防御一致
      try {
        tsId = window.Application.PluginStorage.getItem('taskpane_id') || '';
      } catch (e) {
        console.error('[WPS] 读取 taskpane_id 失败: ' + errMsg(e));
      }
      // 内存 ID 兜底：PluginStorage 持久化失败/读取失败时，用本次会话内存值避免重复创建多窗格
      if (!tsId) {
        tsId = taskpaneIdCache || '';
      }
      var tp = null;
      if (tsId) {
        try {
          // 个别 WPS 版本对无效/过期 id 会抛异常而非返回 null，统一 try/catch 兜底
          tp = window.Application.GetTaskPane(tsId);
        } catch (e) {
          console.error('[WPS] GetTaskPane 获取任务窗格失败: ' + errMsg(e));
          tp = null;
        }
      }
      // 首次创建，或 PluginStorage 读取失败 / GetTaskPane 返回 null/抛异常：统一回退重建（createTaskPane 内部自带 try/catch，失败返回 null）
      if (!tp) {
        tp = createTaskPane();
        if (!tp) {
          // 创建也失败（如 taskpane.html 路径无效）：已留痕，直接返回，避免后续空指针
          return;
        }
        // 首次创建路径：createTaskPane 已统一完成创建/存 ID/校正停靠/置可见
      } else {
        // 每次打开时重新校正停靠位置（右侧），防止位置漂移再次遮挡顶栏；
        // 与 createTaskPane 内保持一致：停靠校正失败（内部已留痕）但窗格仍可用，
        // 补充「窗格仍可用」留痕后不中断可见性切换（下次点击将重新校正，有自愈机会）
        if (!setTaskPaneDockPosition(tp)) {
          console.error('[WPS] 任务窗格停靠校正失败（窗格仍可用，下次点击将重新校正）');
        }
        // Visible 切换也包 try/catch：与 createTaskPane 内 Visible 置位保持统一兜底，
        // 避免个别 WPS 版本对该属性抛异常时直接中断按钮回调（后续 break 分支不执行）
        try {
          tp.Visible = !tp.Visible;
        } catch (e) {
          console.error('[WPS] 切换任务窗格可见性失败: ' + errMsg(e));
        }
        // 二次校正停靠位置（Issue #164）：与 createTaskPane 内同理——WPS 文字在
        // Visible=true 时宿主会重算窗格位置、覆盖 DockPosition=Right。切到可见后
        // 再校正一次，把被覆盖的正确停靠纠正回来。仅面板可见时校正（隐藏时无需）。
        // 失败（内部已留痕）不影响：下次点击仍会重新校正，有自愈机会。
        if (tp.Visible) {
          setTaskPaneDockPosition(tp);
        }
      }
      break;
    case 'btnDockWindow':
      dockOpenCodeWindow();
      break;
    case 'btnCheckStatus':
      checkStatus();
      break;
  }
  return true;
}

function GetImage(control) {
  if (!control) return '';
  var id = getControlId(control);
  if (!id) return '';
  if (id === 'btnShowTaskPane') return 'btn-panel.png';
  if (id === 'btnDockWindow') return 'btn-dock.png';
  if (id === 'btnCheckStatus') return 'btn-status.png';
  return '';
}

function GetImageSize(control) {
  if (!control) return 16;
  var id = getControlId(control);
  if (!id) return 16;
  if (id === 'btnShowTaskPane') return 32;
  return 16;
}

function OnGetEnabled(control) {
  if (!control) return true;
  // 任务窗格和Web面板按钮始终可用；连接状态按钮需文档已打开
  var id = getControlId(control);
  if (id === 'btnShowTaskPane' || id === 'btnDockWindow') return true;
  if (id === 'btnCheckStatus') return checkDocument() !== null;
  console.warn('[WPS] Unknown ribbon button: ' + (id || '(no id)') + ', disabled by default');
  return false; // 未知按钮默认禁用（新增按钮需显式添加 case）
}

function OnGetVisible(control) {
  return true;
}
function OnGetLabel(control) {
  return '';
}

function checkStatus() {
  var cwd = '';
  try {
    cwd = window.Application.PluginStorage.getItem('opencode_cwd') || '';
  } catch (e) {}
  var statusText = '=== OpenCode 状态 ===\n\n';
  statusText += '状态: ' + OPENCODE_STATE + '\n';
  statusText += '地址: ' + OPENCODE_API_BASE + '\n';
  if (cwd) statusText += '工作目录: ' + cwd + '\n';
  if (OPENCODE_ERROR) statusText += '错误: ' + OPENCODE_ERROR + '\n';
  if (OPENCODE_STATE !== 'running') statusText += '\n提示: 请在插件面板中启动 OpenCode 服务\n';

  try {
    if (typeof window.Application !== 'undefined') {
      statusText += '\n=== WPS 信息 ===\n';
      statusText += '应用: ' + (window.Application.Name || 'WPS Office') + '\n';
      if (window.Application.ActiveWorkbook)
        statusText += '文档: ' + window.Application.ActiveWorkbook.Name + ' (Excel)\n';
      else if (window.Application.ActiveDocument)
        statusText += '文档: ' + window.Application.ActiveDocument.Name + ' (Word)\n';
      else if (window.Application.ActivePresentation)
        statusText += '文档: ' + window.Application.ActivePresentation.Name + ' (PPT)\n';
    }
  } catch (e) {
    statusText += '\nWPS 信息获取失败: ' + errMsg(e);
  }
  alert(statusText);
}

/**
 * 打开/停靠任务窗格
 * @param {string} [sessionId] - 会话标识
 */
function dockOpenCodeWindow() {
  var cwd = '';
  var sessionId = '';
  try {
    cwd = window.Application.PluginStorage.getItem('opencode_cwd') || '';
  } catch (e) {}
  try {
    sessionId = window.Application.PluginStorage.getItem('opencode_session_id') || '';
  } catch (e) {}
  if (!cwd) {
    try {
      cwd = window.Application.PluginStorage.getItem('opencode_start_cwd') || '';
    } catch (e) {}
  }
  console.log('[OpenCode] dockOpenCodeWindow cwd: ' + cwd + ' session: ' + sessionId);

  var normalized = cwd.replace(/\\\\/g, '\\');
  var xhr = new XMLHttpRequest();
  xhr.open('POST', LAUNCHER_API + '/dock', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      console.log('[OpenCode] Dock response: ' + xhr.status + ' ' + xhr.responseText);
    }
  };
  xhr.onerror = function () {
    console.log('[OpenCode] Dock error');
  };
  xhr.send(JSON.stringify({ cwd: normalized, session: sessionId }));
  sendDocInfo();
}

var lastCmdTime = 0;

setInterval(function () {
  if (isProcessingCommand) return;
  sendDocInfo();
  try {
    var raw = window.Application.PluginStorage.getItem('opencode_command');
    if (raw) {
      var cmd = raw,
        ts = 0;
      // 尝试解析 JSON 格式 { cmd: string, ts: number }
      if (raw.indexOf('{') === 0) {
        try {
          var parsed = JSON.parse(raw);
          if (parsed.ts && parsed.cmd) {
            ts = parsed.ts;
            cmd = parsed.cmd;
          }
        } catch (e) {}
      }
      if (ts && ts <= lastCmdTime) {
        window.Application.PluginStorage.setItem('opencode_command', '');
        return;
      }
      if (ts) lastCmdTime = ts;
      isProcessingCommand = true;
      window.Application.PluginStorage.setItem('opencode_command', '');
      if (cmd === 'connect') {
        connectOpenCode();
      } else if (cmd.indexOf('start:') === 0) {
        startOpenCodeServer(cmd.substring(6));
      } else if (cmd === 'stop') {
        stopOpenCodeServer();
      } else {
        isProcessingCommand = false;
      }
    }
  } catch (e) {
    isProcessingCommand = false;
  }
}, 500);
