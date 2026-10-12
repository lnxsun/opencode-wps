/**
 * WPS 演示（PPT）操作处理器
 * 演示文稿、幻灯片、形状、文本框、动画、切换效果等
 */

var COLOR_SCHEMES = {
  business: { title: 0x2f5496, body: 0x333333, accent: 0x4472c4 },
  tech: { title: 0x00b0f0, body: 0x404040, accent: 0x0078d7 },
  creative: { title: 0xff6b6b, body: 0x4a4a4a, accent: 0xe74856 },
  minimal: { title: 0x000000, body: 0x666666, accent: 0x999999 },
};

// 校验并归一化 slideIndex（必须为正整数且不越界）；非法返回 null
// 大量 handler 直接 pres.Slides.Item(idx) 对越界抛错返回泛化 fail，统一前置校验给出明确错误

// 宽松 slideIndex 归一化（供大量「缺省默认第 1 张」的 handler 统一使用）：
// - 缺省/非法 -> 1（保持兼容语义）
// - 越界 -> -1（调用方显式 fail）
function safeSlideIndex(pres, slideIndex) {
  var n = parseInt(slideIndex, 10);
  if (isNaN(n) || n < 1) return 1;
  if (n > pres.Slides.Count) return -1;
  return n;
}

// 将颜色参数解析为整型 RGB：支持 #RRGGBB、RRGGBB、RGB 简写；数字直接返回；非法返回 null
// （与 excel-handler 的 toExcelColor 语义对称，供 PPT COM 的 ForeColor.RGB 赋值使用）

registerHandler('getActivePresentation', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');

    // 性能边界：全量遍历所有幻灯片/形状读取文本，大演示文稿（100+ 张×50 形状）数千次 COM 往返会超时
    // （与 unifyFont 的 maxShapes 上限语义对齐）；默认 200，达到后返回 truncated 标记
    var maxShapes = params.maxShapes !== undefined ? parseInt(params.maxShapes, 10) : 200;
    if (isNaN(maxShapes) || maxShapes < 1)
      return fail('无效的 maxShapes: ' + params.maxShapes + '（必须为正整数）');
    var totalShapes = 0;
    var truncated = false;
    var slides = [];
    outer: for (var i = 1; i <= pres.Slides.Count; i++) {
      var slide = pres.Slides.Item(i);
      var shapes = [];
      for (var j = 1; j <= slide.Shapes.Count; j++) {
        var shape = slide.Shapes.Item(j);
        var text = '';
        try {
          if (shape.HasTextFrame && shape.TextFrame.HasText) {
            text = shape.TextFrame.TextRange.Text;
            if (text.length > 50) text = text.substring(0, 50) + '...';
          }
        } catch (e) {}
        shapes.push({ name: shape.Name, type: shape.Type, text: text });
        totalShapes++;
        if (totalShapes >= maxShapes) {
          truncated = true;
          break outer;
        }
      }
      slides.push({ index: i, shapeCount: slide.Shapes.Count, shapes: shapes });
    }

    return ok({
      name: pres.Name,
      path: pres.FullName,
      slideCount: pres.Slides.Count,
      slides: slides,
      truncated: truncated,
      maxShapes: maxShapes,
    });
  } catch (e) {
    return fail('获取演示文稿信息失败: ' + e.message);
  }
});

registerHandler('getOpenPresentations', function (params) {
  try {
    // Presentations 集合保护：无活动窗口时访问抛错（与 getOpenDocuments 第 7 轮修复对齐）
    if (!Application.Presentations) return ok({ presentations: [] });
    var preses = Application.Presentations;
    var list = [];
    for (var i = 1; i <= preses.Count; i++) {
      var p = preses.Item(i);
      list.push({ name: p.Name, path: p.FullName, index: i, slideCount: p.Slides.Count });
    }
    return ok({ presentations: list });
  } catch (e) {
    return ok({ presentations: [], error: e.message });
  }
});

registerHandler('switchPresentation', function (params) {
  try {
    var preses = Application.Presentations;
    var target = params.name !== undefined ? params.name : params.index;
    if (target === undefined || target === null || target === '')
      return invalidParam('缺少 name 或 index');
    var found = null;
    if (typeof target === 'number') {
      found = preses.Item(target);
    } else {
      for (var i = 1; i <= preses.Count; i++) {
        if (preses.Item(i).Name === target) {
          found = preses.Item(i);
          break;
        }
      }
    }
    if (!found) return fail('未找到演示文稿: ' + target);
    found.Activate();
    return ok({ name: found.Name });
  } catch (e) {
    return fail('切换演示文稿失败: ' + e.message);
  }
});

registerHandler('openPresentation', function (params) {
  try {
    var filePath = params.path || params.filePath;
    if (!filePath) return invalidParam('缺少 path');
    var pres = Application.Presentations.Open(filePath);
    return ok({ name: pres.Name, path: pres.FullName });
  } catch (e) {
    return fail('打开演示文稿失败: ' + e.message);
  }
});

registerHandler('createPresentation', function (params) {
  try {
    var pres = Application.Presentations.Add();
    return ok({ name: pres.Name });
  } catch (e) {
    return fail('创建演示文稿失败: ' + e.message);
  }
});

registerHandler('closePresentation', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    pres.Close();
    return ok({});
  } catch (e) {
    return fail('关闭演示文稿失败: ' + e.message);
  }
});

registerHandler('addSlide', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var layouts = { title: 1, title_content: 2, blank: 12, two_column: 3 };
    // 未知 layout 显式 fail（与 setSlideTransition 未知 type 语义一致），避免静默兜底 title_content 误导 AI
    var layoutType = layouts[params.layout];
    if (layoutType === undefined)
      return fail('无效的布局: ' + params.layout + '（支持 title/title_content/blank/two_column）');
    var position =
      params.position !== undefined ? parseInt(params.position, 10) : pres.Slides.Count + 1;
    // position 边界校验：WPS Slides.Add 要求 1 <= position <= Count+1，越界行为未定义（抛错或静默插错位置）
    if (isNaN(position) || position < 1 || position > pres.Slides.Count + 1) {
      return fail(
        '无效的插入位置: ' + params.position + '（合法范围 1~' + (pres.Slides.Count + 1) + '）'
      );
    }
    var slide = pres.Slides.Add(position, layoutType);
    // 标题设置包 try/catch：Slides.Add 已插入幻灯片，若标题设置失败（如布局无标题占位符）不应整体 fail——
    // 否则调用方以为失败、实际已插入一张幻灯片，重试会重复插入（非原子，第 17 轮评审 info）
    var titleFailed = false;
    if (params.title) {
      try {
        if (slide.Shapes.HasTitle) {
          slide.Shapes.Title.TextFrame.TextRange.Text = params.title;
        } else {
          titleFailed = true;
        }
      } catch (e) {
        titleFailed = true;
      }
    }
    // 返回实际插入位置（slide.SlideIndex），而非请求的 position（WPS 可能调整）
    var actualIndex = slide.SlideIndex !== undefined ? slide.SlideIndex : position;
    if (titleFailed) {
      return ok({
        slideIndex: actualIndex,
        titleFailed: true,
        warning: '幻灯片已插入但标题设置失败（布局可能无标题占位符）',
      });
    }
    return ok({ slideIndex: actualIndex });
  } catch (e) {
    return fail('添加幻灯片失败: ' + e.message);
  }
});

registerHandler('deleteSlide', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    // slideIndex=0 时 || 会静默兜底为 1——改为显式优先 slideIndex，0 传给 resolveSlideIndex 显式 fail
    var rawIdx = params.slideIndex !== undefined ? params.slideIndex : params.index || 1;
    var idx = resolveSlideIndex(pres, rawIdx);
    if (idx === null)
      return fail('无效的幻灯片索引: ' + rawIdx + '（合法范围 1~' + pres.Slides.Count + '）');
    pres.Slides.Item(idx).Delete();
    return ok({});
  } catch (e) {
    return fail('删除幻灯片失败: ' + e.message);
  }
});

registerHandler('duplicateSlide', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = resolveSlideIndex(pres, params.slideIndex || 1);
    if (idx === null)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    pres.Slides.Item(idx).Duplicate();
    return ok({});
  } catch (e) {
    return fail('复制幻灯片失败: ' + e.message);
  }
});

registerHandler('moveSlide', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = resolveSlideIndex(pres, params.slideIndex || 1);
    if (idx === null)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var target = params.targetIndex;
    if (target === undefined || target === null) return fail('缺少 targetIndex');
    var targetNum = parseInt(target, 10);
    if (isNaN(targetNum) || targetNum < 1 || targetNum > pres.Slides.Count) {
      return fail('无效的目标位置: ' + target + '（合法范围 1~' + pres.Slides.Count + '）');
    }
    pres.Slides.Item(idx).MoveTo(targetNum);
    return ok({});
  } catch (e) {
    return fail('移动幻灯片失败: ' + e.message);
  }
});

registerHandler('getSlideCount', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    // 返回 slideCount（与 getActivePresentation/getOpenPresentations 契约一致），兼容保留 count 字段
    return ok({ slideCount: pres.Slides.Count, count: pres.Slides.Count });
  } catch (e) {
    return fail('获取幻灯片数量失败: ' + e.message);
  }
});

registerHandler('getSlideInfo', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    // slideIndex=0 时 || 会静默兜底为 1——改为显式优先 slideIndex，0 传给 resolveSlideIndex 显式 fail
    var rawIdx = params.slideIndex !== undefined ? params.slideIndex : params.index || 1;
    var idx = resolveSlideIndex(pres, rawIdx);
    if (idx === null)
      return fail('无效的幻灯片索引: ' + rawIdx + '（合法范围 1~' + pres.Slides.Count + '）');
    var slide = pres.Slides.Item(idx);
    var shapes = [];
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      var s = slide.Shapes.Item(j);
      shapes.push({
        name: s.Name,
        type: s.Type,
        left: s.Left,
        top: s.Top,
        width: s.Width,
        height: s.Height,
      });
    }
    return ok({ index: idx, shapeCount: slide.Shapes.Count, shapes: shapes });
  } catch (e) {
    return fail('获取幻灯片信息失败: ' + e.message);
  }
});

registerHandler('switchSlide', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    // slideIndex=0 时 || 会静默兜底为 1——改为显式优先 slideIndex，0 传给 resolveSlideIndex 显式 fail
    var rawIdx = params.slideIndex !== undefined ? params.slideIndex : params.index || 1;
    var idx = resolveSlideIndex(pres, rawIdx);
    if (idx === null)
      return fail('无效的幻灯片索引: ' + rawIdx + '（合法范围 1~' + pres.Slides.Count + '）');
    pres.Slides.Item(idx).Select();
    return ok({ slideIndex: idx });
  } catch (e) {
    return fail('切换幻灯片失败: ' + e.message);
  }
});

registerHandler('getSlideTitle', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = resolveSlideIndex(pres, params.slideIndex || 1);
    if (idx === null)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var title = '';
    if (slide.Shapes.HasTitle) {
      title = slide.Shapes.Title.TextFrame.TextRange.Text;
    }
    return ok({ slideIndex: idx, title: title });
  } catch (e) {
    return fail('获取幻灯片标题失败: ' + e.message);
  }
});

registerHandler('setSlideTitle', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = resolveSlideIndex(pres, params.slideIndex);
    if (idx === null)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    // 无标题占位符时明确 fail（与 setSlideSubtitle 语义一致），避免 AI 误以为设置成功
    if (!slide.Shapes.HasTitle) return fail('当前幻灯片无标题占位符（可能使用了空白布局）');
    // title 前置校验：undefined 直赋 TextRange.Text 抛类型错误
    if (params.title === undefined || params.title === null) return invalidParam('缺少 title');
    slide.Shapes.Title.TextFrame.TextRange.Text = params.title;
    return ok({});
  } catch (e) {
    return fail('设置幻灯片标题失败: ' + e.message);
  }
});

registerHandler('setSlideSubtitle', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = resolveSlideIndex(pres, params.slideIndex);
    if (idx === null)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    // 按副标题占位符类型（ppPlaceholderSubtitle=15）定位，避免用 t.length<100 猜文本误覆盖标题/正文
    if (params.subtitle === undefined || params.subtitle === null)
      return invalidParam('缺少 subtitle');
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      var s = slide.Shapes.Item(j);
      if (!s.HasTextFrame) continue;
      try {
        var pf = s.PlaceholderFormat;
        if (pf && pf.Type === 15) {
          s.TextFrame.TextRange.Text = params.subtitle;
          return ok({});
        }
      } catch (e) {}
    }
    return fail('未找到副标题占位符');
  } catch (e) {
    return fail('设置幻灯片副标题失败: ' + e.message);
  }
});

registerHandler('setSlideContent', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = resolveSlideIndex(pres, params.slideIndex);
    if (idx === null)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var count = 0;
    // 优先按正文占位符（ppPlaceholderBody=2）定位——与 setSlideSubtitle 按 Type=15 精确定位的语义对称，
    // 避免「第一个有文本的非标题形状」启发式在 [副标题, 正文] 顺序下把副标题当正文覆盖
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      var s = slide.Shapes.Item(j);
      if (!s.HasTextFrame) continue;
      try {
        var pf = s.PlaceholderFormat;
        if (pf && pf.Type === 2) {
          s.TextFrame.TextRange.Text = params.content || '';
          return ok({ updated: true, via: 'body-placeholder' });
        }
      } catch (e) {}
    }
    // 兜底：跳过标题（13/14）与副标题（15）占位符后，取第一个有文本的形状（旧行为，兼容无正文占位符的布局）
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      var s = slide.Shapes.Item(j);
      if (!s.HasTextFrame) continue;
      try {
        var pf = s.PlaceholderFormat;
        if (pf && (pf.Type === 13 || pf.Type === 14 || pf.Type === 15)) continue;
      } catch (e) {}
      if (s.TextFrame.TextRange.Text) {
        s.TextFrame.TextRange.Text = params.content || '';
        count++;
        break;
      }
    }
    return ok({ updated: count > 0 });
  } catch (e) {
    return fail('设置幻灯片内容失败: ' + e.message);
  }
});

// 坐标/尺寸参数显式数值化：undefined/null 取默认，非法字符串返回 null（供 AddTextbox/AddShape/AddTable/AddConnector 统一使用，
// 避免 left=0 被 || 兜底成 100、字符串坐标直赋 COM 抛类型错误）
function toNum(v, def) {
  if (v === undefined || v === null) return def;
  var n = parseFloat(v);
  return isNaN(n) ? null : n;
}

// 校验并归一化一组坐标/尺寸参数：全部必须为数值；返回 null 表示非法
function checkShapeGeom(params) {
  var geom = {};
  var keys = ['left', 'top', 'width', 'height', 'startX', 'startY', 'endX', 'endY'];
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (params[k] !== undefined) {
      var n = parseFloat(params[k]);
      if (isNaN(n)) return null;
      geom[k] = n;
    }
  }
  return geom;
}

registerHandler('addTextBox', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    // 无选中/无活动窗口时安全兜底到第 1 张（与周边 handler 的 slideIndex || 1 语义一致），避免 Selection 抛错
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var geom = checkShapeGeom(params);
    if (!geom) return fail('无效的坐标/尺寸参数（left/top/width/height 必须为数值）');
    var shape = slide.Shapes.AddTextbox(
      1,
      geom.left !== undefined ? geom.left : 100,
      geom.top !== undefined ? geom.top : 100,
      geom.width !== undefined ? geom.width : 400,
      geom.height !== undefined ? geom.height : 50
    );
    shape.TextFrame.TextRange.Text = params.text || '';
    if (params.fontSize) shape.TextFrame.TextRange.Font.Size = params.fontSize;
    if (params.fontName) shape.TextFrame.TextRange.Font.Name = params.fontName;
    return ok({ shapeName: shape.Name });
  } catch (e) {
    return fail('添加文本框失败: ' + e.message);
  }
});

registerHandler('deleteTextBox', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var shapeName = params.shapeName || params.name;
    // shapeName 前置校验：双参都缺时循环空转后「未找到形状」误导（与 setShapeZOrder 语义对齐）
    if (!shapeName) return invalidParam('缺少 shapeName');
    var slide = pres.Slides.Item(idx);
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      if (slide.Shapes.Item(j).Name === shapeName) {
        slide.Shapes.Item(j).Delete();
        return ok({});
      }
    }
    return fail('未找到形状: ' + shapeName);
  } catch (e) {
    return fail('删除文本框失败: ' + e.message);
  }
});

registerHandler('getTextBoxes', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var boxes = [];
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      var s = slide.Shapes.Item(j);
      if (s.HasTextFrame) {
        boxes.push({ name: s.Name, text: s.TextFrame.TextRange.Text });
      }
    }
    return ok({ textBoxes: boxes });
  } catch (e) {
    return fail('获取文本框列表失败: ' + e.message);
  }
});

registerHandler('setTextBoxText', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var shapeName = params.shapeName || params.name;
    // shapeName 前置校验：双参都缺时循环空转后「未找到形状」误导（与 setShapeZOrder 语义对齐）
    if (!shapeName) return invalidParam('缺少 shapeName');
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      if (slide.Shapes.Item(j).Name === shapeName) {
        slide.Shapes.Item(j).TextFrame.TextRange.Text = params.text || '';
        return ok({});
      }
    }
    return fail('未找到形状: ' + shapeName);
  } catch (e) {
    return fail('设置文本框文本失败: ' + e.message);
  }
});

registerHandler('setTextBoxStyle', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var shapeName = params.shapeName || params.name;
    if (!shapeName) return invalidParam('缺少 shapeName');
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      var s = slide.Shapes.Item(j);
      if (s.Name === shapeName && s.HasTextFrame) {
        var tr = s.TextFrame.TextRange;
        if (params.fontName) tr.Font.Name = params.fontName;
        // fontSize 显式数值校验（与 word setFont 语义对齐）：字符串/'16pt' 直赋抛类型错误
        if (params.fontSize !== undefined) {
          var fs = parseFloat(params.fontSize);
          if (isNaN(fs) || fs <= 0)
            return fail('无效的字体大小: ' + params.fontSize + '（必须为正数）');
          tr.Font.Size = fs;
        }
        return ok({});
      }
    }
    return fail('未找到形状: ' + shapeName);
  } catch (e) {
    return fail('设置文本框样式失败: ' + e.message);
  }
});

registerHandler('addShape', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var shapeTypes = { rectangle: 1, oval: 9, line: 6, arrow: 13, diamond: 4, triangle: 5 };
    var st = shapeTypes[params.shapeType] || 1;
    var geom = checkShapeGeom(params);
    if (!geom) return fail('无效的坐标/尺寸参数（left/top/width/height 必须为数值）');
    var shape = slide.Shapes.AddShape(
      st,
      geom.left !== undefined ? geom.left : 100,
      geom.top !== undefined ? geom.top : 100,
      geom.width !== undefined ? geom.width : 100,
      geom.height !== undefined ? geom.height : 100
    );
    if (params.text) {
      shape.TextFrame.TextRange.Text = params.text;
    }
    return ok({ shapeName: shape.Name });
  } catch (e) {
    return fail('添加形状失败: ' + e.message);
  }
});

registerHandler('deleteShape', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var shapeName = params.shapeName || params.name;
    // shapeName 前置校验：双参都缺时循环空转后「未找到形状」误导（与 setShapeZOrder 语义对齐）
    if (!shapeName) return invalidParam('缺少 shapeName');
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      if (slide.Shapes.Item(j).Name === shapeName) {
        slide.Shapes.Item(j).Delete();
        return ok({});
      }
    }
    return fail('未找到形状: ' + shapeName);
  } catch (e) {
    return fail('删除形状失败: ' + e.message);
  }
});

registerHandler('getShapes', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var shapes = [];
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      var s = slide.Shapes.Item(j);
      shapes.push({
        name: s.Name,
        type: s.Type,
        left: s.Left,
        top: s.Top,
        width: s.Width,
        height: s.Height,
      });
    }
    return ok({ shapes: shapes });
  } catch (e) {
    return fail('获取形状列表失败: ' + e.message);
  }
});

registerHandler('setShapeText', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var shapeName = params.shapeName || params.name;
    // shapeName 前置校验：双参都缺时循环空转后「未找到形状」误导（与 setShapeZOrder 语义对齐）
    if (!shapeName) return invalidParam('缺少 shapeName');
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      if (slide.Shapes.Item(j).Name === shapeName) {
        slide.Shapes.Item(j).TextFrame.TextRange.Text = params.text || '';
        return ok({});
      }
    }
    return fail('未找到形状: ' + shapeName);
  } catch (e) {
    return fail('设置形状文本失败: ' + e.message);
  }
});

registerHandler('setShapePosition', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var shapeName = params.shapeName || params.name;
    if (!shapeName) return invalidParam('缺少 shapeName');
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      var s = slide.Shapes.Item(j);
      if (s.Name === shapeName) {
        // 数值显式校验：字符串坐标直赋 COM 抛类型错误（与 addArrow/addConnector 语义对齐）
        if (params.left !== undefined) {
          var lv = parseFloat(params.left);
          if (isNaN(lv)) return fail('无效的 left: ' + params.left);
          s.Left = lv;
        }
        if (params.top !== undefined) {
          var tv = parseFloat(params.top);
          if (isNaN(tv)) return fail('无效的 top: ' + params.top);
          s.Top = tv;
        }
        if (params.width !== undefined) {
          var wv = parseFloat(params.width);
          if (isNaN(wv) || wv <= 0) return fail('无效的 width: ' + params.width + '（必须为正数）');
          s.Width = wv;
        }
        if (params.height !== undefined) {
          var hv = parseFloat(params.height);
          if (isNaN(hv) || hv <= 0)
            return fail('无效的 height: ' + params.height + '（必须为正数）');
          s.Height = hv;
        }
        return ok({});
      }
    }
    return fail('未找到形状: ' + shapeName);
  } catch (e) {
    return fail('设置形状位置失败: ' + e.message);
  }
});

registerHandler('setShapeStyle', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var shapeName = params.shapeName || params.name;
    // shapeName 前置校验：双参都缺时循环空转后「未找到形状」误导（与 setShapeZOrder 语义对齐）
    if (!shapeName) return invalidParam('缺少 shapeName');
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      var s = slide.Shapes.Item(j);
      if (s.Name === shapeName) {
        if (params.fillColor) {
          var fc = toRgb(params.fillColor);
          if (fc === null) return fail('无效的填充颜色: ' + params.fillColor);
          s.Fill.ForeColor.RGB = fc;
          if (!s.Fill.Visible) s.Fill.Visible = 1;
        }
        if (params.lineColor) {
          var lc = toRgb(params.lineColor);
          if (lc === null) return fail('无效的线条颜色: ' + params.lineColor);
          s.Line.ForeColor.RGB = lc;
        }
        return ok({});
      }
    }
    return fail('未找到形状: ' + shapeName);
  } catch (e) {
    return fail('设置形状样式失败: ' + e.message);
  }
});

registerHandler('setShapeBorder', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var shapeName = params.shapeName || params.name;
    if (!shapeName) return invalidParam('缺少 shapeName');
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      var s = slide.Shapes.Item(j);
      if (s.Name === shapeName) {
        s.Line.Visible = 1;
        if (params.color) {
          var lc = toRgb(params.color);
          if (lc === null) return fail('无效的边框颜色: ' + params.color);
          s.Line.ForeColor.RGB = lc;
        }
        // weight 显式数值校验：字符串/'2pt' 直赋抛类型错误（与 setShapeFullStyle 语义对齐）
        if (params.weight !== undefined) {
          var wv = parseFloat(params.weight);
          if (isNaN(wv) || wv <= 0)
            return fail('无效的边框粗细: ' + params.weight + '（必须为正数）');
          s.Line.Weight = wv;
        }
        return ok({});
      }
    }
    return fail('未找到形状: ' + shapeName);
  } catch (e) {
    return fail('设置形状边框失败: ' + e.message);
  }
});

registerHandler('setShapeShadow', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var shapeName = params.shapeName || params.name;
    // shapeName 前置校验（与 setShapeStyle 语义对齐）
    if (!shapeName) return invalidParam('缺少 shapeName');
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      var s = slide.Shapes.Item(j);
      if (s.Name === shapeName) {
        s.Shadow.Visible = params.visible !== false ? 1 : 0;
        return ok({});
      }
    }
    return fail('未找到形状: ' + shapeName);
  } catch (e) {
    return fail('设置形状阴影失败: ' + e.message);
  }
});

registerHandler('setShapeTransparency', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var shapeName = params.shapeName || params.name;
    // shapeName 前置校验（与 setShapeStyle 语义对齐）
    if (!shapeName) return invalidParam('缺少 shapeName');
    // 透明度显式数值校验：0~1 范围（0=不透明，1=全透明），字符串/负数/越界显式 fail，
    // 避免 '0.5' 字符串直接赋 COM 属性抛类型错误、负数静默生效
    var transparency = parseFloat(params.transparency);
    if (isNaN(transparency) || transparency < 0 || transparency > 1)
      return fail('无效的透明度: ' + params.transparency + '（必须在 0~1 之间）');
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      var s = slide.Shapes.Item(j);
      if (s.Name === shapeName) {
        s.Fill.Transparency = transparency;
        return ok({});
      }
    }
    return fail('未找到形状: ' + shapeName);
  } catch (e) {
    return fail('设置形状透明度失败: ' + e.message);
  }
});

registerHandler('setShapeZOrder', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var shapeName = params.shapeName || params.name;
    // shapeName 前置校验：循环空转后「未找到形状」误导（实际是参数问题）
    if (!shapeName) return invalidParam('缺少 shapeName');
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      var s = slide.Shapes.Item(j);
      if (s.Name === shapeName) {
        var cmd = params.command || 'forward';
        if (cmd === 'forward' || cmd === 'up') s.ZOrder(1);
        else if (cmd === 'backward' || cmd === 'down') s.ZOrder(2);
        else if (cmd === 'front' || cmd === 'top') s.ZOrder(0);
        else if (cmd === 'bottom' || cmd === 'back') s.ZOrder(3);
        else
          // 未知 command 显式 fail：四个分支全不命中时原实现 return ok 假成功
          return fail('无效的层级命令: ' + cmd + '（支持 forward/backward/front/bottom）');
        return ok({});
      }
    }
    return fail('未找到形状: ' + shapeName);
  } catch (e) {
    return fail('设置形状层级失败: ' + e.message);
  }
});

registerHandler('groupShapes', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    // shapeNames 显式数组校验：字符串/'abc' 传 Shapes.Range 抛类型错误
    var names = params.shapeNames;
    if (!Array.isArray(names) || names.length < 2)
      return fail('至少需要两个形状（shapeNames 数组）');
    var range = slide.Shapes.Range(names);
    var group = range.Group();
    return ok({ groupName: group.Name });
  } catch (e) {
    return fail('组合形状失败: ' + e.message);
  }
});

registerHandler('duplicateShape', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var shapeName = params.shapeName || params.name;
    // shapeName 前置校验：双参都缺时循环空转后「未找到形状」误导（与 setShapeZOrder 语义对齐）
    if (!shapeName) return invalidParam('缺少 shapeName');
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      if (slide.Shapes.Item(j).Name === shapeName) {
        var dup = slide.Shapes.Item(j).Duplicate();
        return ok({ shapeName: dup.Name });
      }
    }
    return fail('未找到形状: ' + shapeName);
  } catch (e) {
    return fail('复制形状失败: ' + e.message);
  }
});

registerHandler('alignShapes', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    // shapeNames 显式数组校验：字符串/'abc' 传 Shapes.Range 抛类型错误
    var names = params.shapeNames;
    if (!Array.isArray(names) || names.length < 2)
      return fail('至少需要两个形状（shapeNames 数组）');
    var range = slide.Shapes.Range(names);
    var align = params.align || 'left';
    var map = { left: 0, center: 1, right: 2, top: 3, middle: 4, bottom: 5 };
    range.Align(map[align] || 0, 0);
    return ok({});
  } catch (e) {
    return fail('对齐形状失败: ' + e.message);
  }
});

registerHandler('distributeShapes', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    // shapeNames 显式数组校验：字符串/'abc' 传 Shapes.Range 抛类型错误
    var names = params.shapeNames;
    if (!Array.isArray(names) || names.length < 2)
      return fail('至少需要两个形状（shapeNames 数组）');
    var range = slide.Shapes.Range(names);
    if (params.direction === 'horizontal') range.Distribute(0, 0);
    else range.Distribute(1, 0);
    return ok({});
  } catch (e) {
    return fail('分布形状失败: ' + e.message);
  }
});

registerHandler('smartDistribute', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    // shapeNames 显式数组校验：字符串/'abc' 传 Shapes.Range 抛类型错误
    var names = params.shapeNames;
    if (!Array.isArray(names) || names.length < 2)
      return fail('至少需要两个形状（shapeNames 数组）');
    var range = slide.Shapes.Range(names);
    range.Align(1, 0);
    range.Distribute(0, 0);
    return ok({});
  } catch (e) {
    return fail('智能分布失败: ' + e.message);
  }
});

registerHandler('setSlideBackground', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    if (params.color !== undefined) {
      slide.FollowMasterBackground = 0;
      var bg = toRgb(params.color);
      if (bg === null) return fail('无效的背景颜色: ' + params.color);
      slide.Background.Fill.ForeColor.RGB = bg;
      slide.Background.Fill.Visible = 1;
    }
    if (params.imagePath || params.path) {
      var img = params.imagePath || params.path;
      slide.FollowMasterBackground = 0;
      slide.Background.Fill.UserPicture(img);
    }
    return ok({});
  } catch (e) {
    return fail('设置幻灯片背景失败: ' + e.message);
  }
});

registerHandler('setSlideLayout', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = resolveSlideIndex(pres, params.slideIndex);
    if (idx === null)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var layouts = { title: 1, title_content: 2, blank: 12, two_column: 3 };
    // 未知 layout 显式 fail（与 addSlide 语义一致）
    var lt = layouts[params.layout];
    if (lt === undefined)
      return fail('无效的布局: ' + params.layout + '（支持 title/title_content/blank/two_column）');
    slide.Layout = lt;
    return ok({});
  } catch (e) {
    return fail('设置幻灯片布局失败: ' + e.message);
  }
});

registerHandler('setSlideNumber', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = resolveSlideIndex(pres, params.slideIndex || 1);
    if (idx === null)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    slide.HeadersFooters.SlideNumber.Visible = 1;
    return ok({});
  } catch (e) {
    return fail('设置幻灯片编号失败: ' + e.message);
  }
});

registerHandler('setSlideTransition', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = resolveSlideIndex(pres, params.slideIndex || 1);
    if (idx === null)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var types = { fade: 1, push: 2, wipe: 3, split: 4, uncover: 5, cover: 6, zoom: 31 };
    // 未知 type 显式 fail（与 setShapeRoundness 形状类型校验一致），避免静默兜底 fade 误导 AI
    var entryEffect = types[params.type];
    if (entryEffect === undefined)
      return fail(
        '无效的切换类型: ' + params.type + '（支持 fade/push/wipe/split/uncover/cover/zoom）'
      );
    slide.SlideShowTransition.EntryEffect = entryEffect;
    if (params.speed !== undefined) {
      var speedMap = { slow: 3, medium: 2, fast: 1 };
      var speed = speedMap[params.speed];
      if (speed === undefined)
        return fail('无效的切换速度: ' + params.speed + '（支持 slow/medium/fast）');
      slide.SlideShowTransition.Speed = speed;
    }
    return ok({});
  } catch (e) {
    return fail('设置幻灯片切换效果失败: ' + e.message);
  }
});

registerHandler('removeSlideTransition', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = resolveSlideIndex(pres, params.slideIndex || 1);
    if (idx === null)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    pres.Slides.Item(idx).SlideShowTransition.EntryEffect = 0;
    return ok({});
  } catch (e) {
    return fail('移除幻灯片切换效果失败: ' + e.message);
  }
});

registerHandler('applyTransitionToAll', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var types = { fade: 1, push: 2, wipe: 3, split: 4, uncover: 5, cover: 6, zoom: 31 };
    // 未知 type 显式 fail（与 setSlideTransition 语义对齐），避免静默兜底 fade 误导 AI
    var transitionType = types[params.type];
    if (transitionType === undefined)
      return fail(
        '无效的切换类型: ' + params.type + '（支持 fade/push/wipe/split/uncover/cover/zoom）'
      );
    for (var i = 1; i <= pres.Slides.Count; i++) {
      pres.Slides.Item(i).SlideShowTransition.EntryEffect = transitionType;
    }
    return ok({});
  } catch (e) {
    return fail('应用全局切换效果失败: ' + e.message);
  }
});

registerHandler('addAnimation', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var shapeName = params.shapeName || params.name;
    // shapeName 前置校验：循环空转后「未找到形状」误导（与 setShapeZOrder 语义对齐）
    if (!shapeName) return invalidParam('缺少 shapeName');
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      if (slide.Shapes.Item(j).Name === shapeName) {
        var effectTypes = { fade: 0, flyIn: 1, zoomIn: 64, wipe: 15 };
        // 未知 animationType 显式 fail（与 setSlideTransition 语义一致）
        var etype = effectTypes[params.animationType || 'fade'];
        if (etype === undefined)
          return fail(
            '无效的动画类型: ' + params.animationType + '（支持 fade/flyIn/zoomIn/wipe）'
          );
        slide.TimeLine.MainSequence.AddEffect(slide.Shapes.Item(j), 0, 0, etype);
        return ok({});
      }
    }
    return fail('未找到形状: ' + shapeName);
  } catch (e) {
    return fail('添加动画失败: ' + e.message);
  }
});

registerHandler('removeAnimation', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    // 循环上限防死循环：若 Item(1).Delete() 不减少 Count（部分 WPS 语义异常）会无限循环
    var maxIter = 1000;
    var iter = 0;
    while (slide.TimeLine.MainSequence.Count > 0 && iter < maxIter) {
      slide.TimeLine.MainSequence.Item(1).Delete();
      iter++;
    }
    if (iter >= maxIter) return fail('移除动画达到循环上限（' + maxIter + '），可能仍有残留动画');
    return ok({});
  } catch (e) {
    return fail('移除动画失败: ' + e.message);
  }
});

registerHandler('startSlideShow', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    // 前置校验：无幻灯片时放映抛费解错误（与 endSlideShow 幂等保护语义对齐）
    if (pres.Slides.Count < 1) return fail('演示文稿没有幻灯片，无法放映');
    pres.SlideShowSettings.Run();
    return ok({});
  } catch (e) {
    return fail('开始放映失败: ' + e.message);
  }
});

registerHandler('endSlideShow', function (params) {
  try {
    // 无放映窗口时视为已结束（幂等），避免 Item(1) 抛错误导 AI
    var windows = Application.SlideShowWindows;
    if (!windows || windows.Count < 1) return ok({ alreadyStopped: true });
    windows.Item(1).View.Exit();
    return ok({});
  } catch (e) {
    return fail('结束放映失败: ' + e.message);
  }
});

registerHandler('insertPptImage', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var filePath = params.path || params.imagePath;
    if (!filePath) return invalidParam('缺少 path');
    // 尺寸/坐标显式数值化（与 insertExcelImage 第 7 轮修复语义对齐）：0 是合法值不能被 || 吞掉，字符串直赋抛类型错误
    function imgSize(v) {
      if (v === undefined || v === null) return -1;
      var n = parseFloat(v);
      return isNaN(n) ? null : n;
    }
    var w = imgSize(params.width);
    var h = imgSize(params.height);
    if (w === null || h === null) return fail('无效的图片尺寸（width/height 必须为数值）');
    var left = params.left !== undefined ? parseFloat(params.left) : 0;
    if (isNaN(left)) return fail('无效的 left: ' + params.left);
    var top = params.top !== undefined ? parseFloat(params.top) : 0;
    if (isNaN(top)) return fail('无效的 top: ' + params.top);
    var pic = slide.Shapes.AddPicture(filePath, false, true, left, top, w, h);
    return ok({ name: pic.Name });
  } catch (e) {
    return fail('插入图片失败: ' + e.message);
  }
});

registerHandler('deletePptImage', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var shapeName = params.shapeName || params.name;
    // shapeName 前置校验：双参都缺时循环空转后「未找到形状」误导（与 setShapeZOrder 语义对齐）
    if (!shapeName) return invalidParam('缺少 shapeName');
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      if (slide.Shapes.Item(j).Name === shapeName) {
        slide.Shapes.Item(j).Delete();
        return ok({});
      }
    }
    return fail('未找到图片形状: ' + shapeName);
  } catch (e) {
    return fail('删除图片失败: ' + e.message);
  }
});

registerHandler('insertPptTable', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var rows = params.rows || 3;
    var cols = params.cols || 3;
    // 行列显式校验：0/负数/字符串静默兜底问题（与 excel insertRows 语义对齐），
    // 避免 rows:'0' 传 AddTable 抛类型错误或生成空表
    var rowsNum = parseInt(rows, 10);
    if (isNaN(rowsNum) || rowsNum < 1) return fail('无效的行数: ' + rows + '（必须为正整数）');
    var colsNum = parseInt(cols, 10);
    if (isNaN(colsNum) || colsNum < 1) return fail('无效的列数: ' + cols + '（必须为正整数）');
    rows = rowsNum;
    cols = colsNum;
    var geom = checkShapeGeom(params);
    if (!geom) return fail('无效的坐标/尺寸参数（left/top/width/height 必须为数值）');
    var table = slide.Shapes.AddTable(
      rows,
      cols,
      geom.left !== undefined ? geom.left : 100,
      geom.top !== undefined ? geom.top : 100,
      geom.width !== undefined ? geom.width : 400,
      geom.height !== undefined ? geom.height : 200
    );
    if (params.data) {
      for (var r = 0; r < Math.min(params.data.length, rows); r++) {
        // 行归一化为数组：兼容标量/null 行（与 excel setRangeData 的 toRowArray 语义一致），避免 .length 抛 TypeError
        var rowData = params.data[r];
        if (rowData && typeof rowData === 'object' && rowData.length !== undefined) {
          for (var c = 0; c < Math.min(rowData.length, cols); c++) {
            table.Table.Cell(r + 1, c + 1).Shape.TextFrame.TextRange.Text = String(rowData[c]);
          }
        } else if (rowData !== null && rowData !== undefined) {
          table.Table.Cell(r + 1, 1).Shape.TextFrame.TextRange.Text = String(rowData);
        }
      }
    }
    return ok({});
  } catch (e) {
    return fail('插入表格失败: ' + e.message);
  }
});

// 在指定幻灯片中按名称或序号（第 N 个表格）定位表格形状；非表格返回 null
function findPptTable(slide, tableNameOrIndex) {
  // 数字字符串（'1'/'2'）归一化为数字：否则走名称分支按 '1' 查找找不到（与 resolveSlideIndex 语义对齐）
  if (typeof tableNameOrIndex === 'string' && /^\d+$/.test(tableNameOrIndex.trim())) {
    tableNameOrIndex = parseInt(tableNameOrIndex, 10);
  }
  if (typeof tableNameOrIndex === 'number') {
    // 按"第 N 个表格"定位
    var n = 0;
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      var s = slide.Shapes.Item(j);
      if (s.HasTable) {
        n++;
        if (n === tableNameOrIndex) return s;
      }
    }
    return null;
  }
  if (tableNameOrIndex == null) {
    // 默认取第一个表格
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      if (slide.Shapes.Item(j).HasTable) return slide.Shapes.Item(j);
    }
    return null;
  }
  // 按名称精确匹配
  for (var j = 1; j <= slide.Shapes.Count; j++) {
    var s = slide.Shapes.Item(j);
    if (s.Name === tableNameOrIndex && s.HasTable) return s;
  }
  return null;
}

registerHandler('getPptTableCell', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = resolveSlideIndex(pres, params.slideIndex);
    if (idx === null)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var table = findPptTable(
      slide,
      params.tableName !== undefined ? params.tableName : params.tableIndex || 1
    );
    if (!table) return fail('未找到表格形状（需为表格且名称/序号匹配）');
    // 行列显式校验：0/负数/字符串传 Table.Cell 抛费解错误（与 excel 侧 resolveRowCol 语义对齐）
    var rowNum = parseInt(params.row, 10);
    if (isNaN(rowNum) || rowNum < 1) return fail('无效的行号: ' + params.row + '（必须为正整数）');
    var colNum = parseInt(params.col, 10);
    if (isNaN(colNum) || colNum < 1) return fail('无效的列号: ' + params.col + '（必须为正整数）');
    var cell = table.Table.Cell(rowNum, colNum);
    return ok({ text: cell.Shape.TextFrame.TextRange.Text });
  } catch (e) {
    return fail('获取表格单元格失败: ' + e.message);
  }
});

registerHandler('setPptTableCell', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = resolveSlideIndex(pres, params.slideIndex);
    if (idx === null)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var table = findPptTable(
      slide,
      params.tableName !== undefined ? params.tableName : params.tableIndex || 1
    );
    if (!table) return fail('未找到表格形状（需为表格且名称/序号匹配）');
    // 行列显式校验（与 getPptTableCell 语义对齐）
    var rowNum = parseInt(params.row, 10);
    if (isNaN(rowNum) || rowNum < 1) return fail('无效的行号: ' + params.row + '（必须为正整数）');
    var colNum = parseInt(params.col, 10);
    if (isNaN(colNum) || colNum < 1) return fail('无效的列号: ' + params.col + '（必须为正整数）');
    table.Table.Cell(rowNum, colNum).Shape.TextFrame.TextRange.Text = params.text || '';
    return ok({});
  } catch (e) {
    return fail('设置表格单元格失败: ' + e.message);
  }
});

registerHandler('unifyFont', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    // Linux 默认字体：思源黑体（主流发行版预装）；调用方可显式传 fontName 覆盖
    var fontName = params.fontName || '微软雅黑';
    // 全量遍历性能边界：大演示文稿（100+ 张×几十形状）数千次 COM 往返会超时被 MCP kill。
    // 增加 maxShapes 上限（默认 500），达到上限返回 truncated 提示（第 19 轮评审 info）
    var maxShapes = params.maxShapes !== undefined ? parseInt(params.maxShapes, 10) : 500;
    if (isNaN(maxShapes) || maxShapes < 1)
      return fail('无效的 maxShapes: ' + params.maxShapes + '（必须为正整数）');
    var count = 0;
    var truncated = false;
    outer: for (var i = 1; i <= pres.Slides.Count; i++) {
      var slide = pres.Slides.Item(i);
      for (var j = 1; j <= slide.Shapes.Count; j++) {
        try {
          var s = slide.Shapes.Item(j);
          if (s.HasTextFrame && s.TextFrame.HasText) {
            s.TextFrame.TextRange.Font.Name = fontName;
            count++;
            if (count >= maxShapes) {
              truncated = true;
              break outer;
            }
          }
        } catch (e) {}
      }
    }
    return ok({ fontName: fontName, count: count, truncated: truncated, maxShapes: maxShapes });
  } catch (e) {
    return fail('统一字体失败: ' + e.message);
  }
});

registerHandler('beautifySlide', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var scheme = COLOR_SCHEMES[params.style] || COLOR_SCHEMES.business;
    var count = 0;
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      try {
        var s = slide.Shapes.Item(j);
        if (s.HasTextFrame && s.TextFrame.HasText) {
          var tr = s.TextFrame.TextRange;
          if (tr.Font.Size >= 24) tr.Font.Color.RGB = scheme.title;
          else tr.Font.Color.RGB = scheme.body;
          count++;
        }
      } catch (e) {}
    }
    return ok({ style: params.style || 'business', count: count });
  } catch (e) {
    return fail('美化幻灯片失败: ' + e.message);
  }
});

registerHandler('autoBeautifySlide', function (params) {
  return beautifySlideImpl(params);
});

registerHandler('beautifyAllSlides', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var scheme = COLOR_SCHEMES[params.style] || COLOR_SCHEMES.business;
    var total = 0;
    for (var i = 1; i <= pres.Slides.Count; i++) {
      var slide = pres.Slides.Item(i);
      for (var j = 1; j <= slide.Shapes.Count; j++) {
        try {
          var s = slide.Shapes.Item(j);
          if (s.HasTextFrame && s.TextFrame.HasText) {
            var tr = s.TextFrame.TextRange;
            if (tr.Font.Size >= 24) tr.Font.Color.RGB = scheme.title;
            else tr.Font.Color.RGB = scheme.body;
            total++;
          }
        } catch (e) {}
      }
    }
    return ok({ style: params.style || 'business', total: total });
  } catch (e) {
    return fail('全局美化失败: ' + e.message);
  }
});

function beautifySlideImpl(params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var scheme = COLOR_SCHEMES[params.style] || COLOR_SCHEMES.business;
    var count = 0;
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      try {
        var s = slide.Shapes.Item(j);
        if (s.HasTextFrame && s.TextFrame.HasText) {
          if (s.TextFrame.TextRange.Font.Size >= 24)
            s.TextFrame.TextRange.Font.Color.RGB = scheme.title;
          else s.TextFrame.TextRange.Font.Color.RGB = scheme.body;
          count++;
        }
      } catch (e) {}
    }
    return ok({ style: params.style || 'business', count: count });
  } catch (e) {
    return fail('自动美化失败: ' + e.message);
  }
}

registerHandler('autoLayout', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var totalW = 0,
      count = 0;
    var maxRight = 0;
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      if (slide.Shapes.Item(j).Width > 50) {
        totalW += slide.Shapes.Item(j).Width;
        var right = slide.Shapes.Item(j).Left + slide.Shapes.Item(j).Width;
        if (right > maxRight) maxRight = right;
        count++;
      }
    }
    // 空白幻灯片（无有效形状）直接返回，避免 Shapes.Item(1) 越界
    if (count === 0) return ok({ layouted: 0 });
    // 总宽基准用「最右边界」而非 Shapes.Item(1).Width：
    // 若第 1 个形状是窄装饰形状（宽度 < 有效形状），原实现会算出负 spacing 或错位（真实 bug）
    var spacing = (maxRight - totalW) / (count + 1);
    if (spacing < 10) spacing = 10;
    var curX = spacing;
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      if (slide.Shapes.Item(j).Width > 50) {
        slide.Shapes.Item(j).Left = curX;
        curX += slide.Shapes.Item(j).Width + spacing;
      }
    }
    return ok({});
  } catch (e) {
    return fail('自动布局失败: ' + e.message);
  }
});

registerHandler('addArrow', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    // 坐标/宽高显式数值校验（复用顶部全局 toNum）：字符串坐标直赋 AddShape 抛类型错误（与 setSlideSize 语义对齐）
    var startX = toNum(params.startX, 100);
    var startY = toNum(params.startY, 100);
    var endX = toNum(params.endX, 200);
    var endY = toNum(params.endY, 100);
    if (startX === null || startY === null || endX === null || endY === null)
      return fail('无效的坐标参数（startX/startY/endX/endY 必须为数值）');
    var width = Math.abs(endX - startX) || 100;
    var height = Math.abs(endY - startY) || 20;
    var shape = slide.Shapes.AddShape(
      33,
      Math.min(startX, endX),
      Math.min(startY, endY),
      width,
      height
    );
    return ok({ shapeName: shape.Name });
  } catch (e) {
    return fail('添加箭头失败: ' + e.message);
  }
});

registerHandler('addConnector', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    // 坐标显式数值化：字符串坐标直赋 AddConnector 抛类型错误（与 addArrow 第 3 轮修复语义对齐）
    var startX = toNum(params.startX, 100);
    var startY = toNum(params.startY, 100);
    var endX = toNum(params.endX, 300);
    var endY = toNum(params.endY, 100);
    if (startX === null || startY === null || endX === null || endY === null)
      return fail('无效的坐标参数（startX/startY/endX/endY 必须为数值）');
    var shape = slide.Shapes.AddConnector(1, startX, startY, endX, endY);
    return ok({ shapeName: shape.Name });
  } catch (e) {
    return fail('添加连接线失败: ' + e.message);
  }
});

registerHandler('addPptHyperlink', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var shapeName = params.shapeName || params.name;
    // url/shapeName 前置校验：Address=undefined 抛类型错误、缺 shapeName 循环空转后误导（与 addPptHyperlink 语义对齐）
    if (!params.url) return invalidParam('缺少 url');
    if (!shapeName) return invalidParam('缺少 shapeName');
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      if (slide.Shapes.Item(j).Name === shapeName) {
        slide.Shapes.Item(j).ActionSettings.Item(1).Hyperlink.Address = params.url;
        return ok({});
      }
    }
    return fail('未找到形状: ' + shapeName);
  } catch (e) {
    return fail('添加超链接失败: ' + e.message);
  }
});

registerHandler('removePptHyperlink', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var shapeName = params.shapeName || params.name;
    // shapeName 前置校验：双参都缺时循环空转后「未找到形状」误导（与 setShapeZOrder 语义对齐）
    if (!shapeName) return invalidParam('缺少 shapeName');
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      if (slide.Shapes.Item(j).Name === shapeName) {
        slide.Shapes.Item(j).ActionSettings.Item(1).Hyperlink.Delete();
        return ok({});
      }
    }
    return fail('未找到形状: ' + shapeName);
  } catch (e) {
    return fail('移除超链接失败: ' + e.message);
  }
});

registerHandler('findPptText', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var query = params.query || params.text;
    if (!query) return invalidParam('缺少 query');
    var results = [];
    for (var i = 1; i <= pres.Slides.Count; i++) {
      var slide = pres.Slides.Item(i);
      for (var j = 1; j <= slide.Shapes.Count; j++) {
        try {
          var s = slide.Shapes.Item(j);
          if (s.HasTextFrame && s.TextFrame.HasText) {
            var t = s.TextFrame.TextRange.Text;
            if (t.indexOf(query) !== -1) {
              results.push({ slideIndex: i, shapeName: s.Name, text: t.substring(0, 100) });
            }
          }
        } catch (e) {}
      }
    }
    return ok({ query: query, results: results, count: results.length });
  } catch (e) {
    return fail('查找失败: ' + e.message);
  }
});

registerHandler('replacePptText', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    // findText 前置校验：空字符串时 indexOf('') 恒为 0 会把所有形状替换，undefined 的 .replace 抛 TypeError（与 replaceInSheet/findReplace 语义对齐）
    if (!params.findText) return invalidParam('缺少 findText');
    var count = 0;
    for (var i = 1; i <= pres.Slides.Count; i++) {
      var slide = pres.Slides.Item(i);
      for (var j = 1; j <= slide.Shapes.Count; j++) {
        try {
          var s = slide.Shapes.Item(j);
          if (s.HasTextFrame && s.TextFrame.HasText) {
            var tr = s.TextFrame.TextRange;
            if (tr.Text.indexOf(params.findText) !== -1) {
              tr.Text = tr.Text.replace(
                new RegExp(params.findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                params.replaceText || ''
              );
              count++;
            }
          }
        } catch (e) {}
      }
    }
    return ok({ count: count });
  } catch (e) {
    return fail('替换文本失败: ' + e.message);
  }
});

// 在备注页中定位备注占位符形状：优先 ppPlaceholderBody(2)/ppPlaceholderObject(7)，其次找第一个有文本的文本框

registerHandler('getSlideNotes', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = resolveSlideIndex(pres, params.slideIndex || 1);
    if (idx === null)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var notes = '';
    try {
      var shape = findNotesShape(slide.NotesPage.Shapes);
      if (shape) notes = shape.TextFrame.TextRange.Text || '';
    } catch (e) {}
    return ok({ slideIndex: idx, notes: notes });
  } catch (e) {
    return fail('获取备注失败: ' + e.message);
  }
});

registerHandler('setSlideNotes', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = resolveSlideIndex(pres, params.slideIndex || 1);
    if (idx === null)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var shape = findNotesShape(slide.NotesPage.Shapes);
    if (!shape) return fail('未找到备注占位符，无法写入备注');
    shape.TextFrame.TextRange.Text = params.notes || '';
    return ok({});
  } catch (e) {
    return fail('设置备注失败: ' + e.message);
  }
});

registerHandler('exportSlideAsImage', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = resolveSlideIndex(pres, params.slideIndex || 1);
    if (idx === null)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var outputPath = params.outputPath || params.path;
    if (!outputPath) return invalidParam('缺少 outputPath');
    // 宽高显式校验（与 setSlideSize 一致）：0/"0"/负数/字符串静默兜底问题
    var width = params.width !== undefined ? parseInt(params.width, 10) : 1920;
    if (isNaN(width) || width <= 0)
      return fail('无效的导出宽度: ' + params.width + '（必须为正数）');
    var height = params.height !== undefined ? parseInt(params.height, 10) : 1080;
    if (isNaN(height) || height <= 0)
      return fail('无效的导出高度: ' + params.height + '（必须为正数）');
    // format 白名单校验（避免任意字符串传给 Export 抛类型错误）
    var format = (params.format || 'PNG').toUpperCase();
    var allowed = { PNG: 'PNG', JPG: 'JPG', JPEG: 'JPG', GIF: 'GIF', BMP: 'BMP' };
    var filterName = allowed[format];
    if (!filterName)
      return fail('无效的导出格式: ' + params.format + '（支持 PNG/JPG/JPEG/GIF/BMP）');
    var slide = pres.Slides.Item(idx);
    slide.Export(outputPath, filterName, width, height);
    return ok({ slideIndex: idx, outputPath: outputPath, format: filterName });
  } catch (e) {
    return fail('导出幻灯片为图片失败: ' + e.message);
  }
});

registerHandler('applyColorScheme', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var scheme = COLOR_SCHEMES[params.style] || COLOR_SCHEMES.business;
    var count = 0;
    for (var i = 1; i <= pres.Slides.Count; i++) {
      var slide = pres.Slides.Item(i);
      for (var j = 1; j <= slide.Shapes.Count; j++) {
        try {
          var s = slide.Shapes.Item(j);
          if (s.HasTextFrame && s.TextFrame.HasText) {
            var tr = s.TextFrame.TextRange;
            if (tr.Font.Size >= 24) tr.Font.Color.RGB = scheme.title;
            else tr.Font.Color.RGB = scheme.body;
            count++;
          }
        } catch (e) {}
      }
    }
    return ok({ style: params.style || 'business', count: count });
  } catch (e) {
    return fail('应用配色方案失败: ' + e.message);
  }
});

registerHandler('setMasterBackground', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var master = pres.SlideMaster;
    if (params.color !== undefined) {
      var bg = toRgb(params.color);
      if (bg === null) return fail('无效的背景颜色: ' + params.color);
      master.Background.Fill.ForeColor.RGB = bg;
      master.Background.Fill.Visible = 1;
    }
    return ok({});
  } catch (e) {
    return fail('设置母版背景失败: ' + e.message);
  }
});

registerHandler('getSlideMaster', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var master = pres.SlideMaster;
    return ok({ name: master.Name, width: master.Width, height: master.Height });
  } catch (e) {
    return fail('获取母版信息失败: ' + e.message);
  }
});

registerHandler('setPptFooter', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var hf = pres.SlideMaster.HeadersFooters;
    // hf 保护：母版缺失时抛错（与 setPptDateTime 第 4 轮修复语义对齐）
    if (!hf) return fail('当前演示文稿无页眉页脚（母版缺失）');
    hf.Footer.Visible = 1;
    hf.Footer.Text = params.text || '';
    return ok({});
  } catch (e) {
    return fail('设置页脚失败: ' + e.message);
  }
});

registerHandler('setPptDateTime', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var hf = pres.SlideMaster.HeadersFooters;
    if (!hf) return fail('当前演示文稿无页眉页脚（母版缺失）');
    hf.DateAndTime.Visible = 1;
    // 修复逻辑矛盾：auto 模式只设 UseFormat；非 auto 只设 Text（原实现两个都设，UseFormat 后仍覆盖 Text）
    if (params.format === 'auto') {
      hf.DateAndTime.UseFormat = true;
      return ok({ format: 'auto' });
    }
    hf.DateAndTime.UseFormat = false;
    hf.DateAndTime.Text = params.text || '';
    return ok({});
  } catch (e) {
    return fail('设置日期时间失败: ' + e.message);
  }
});

registerHandler('setImageStyle', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var shapeName = params.shapeName || params.name;
    if (!shapeName) return invalidParam('缺少 shapeName');
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      var s = slide.Shapes.Item(j);
      if (s.Name === shapeName) {
        // 尺寸显式数值化：字符串直赋抛类型错误（与 setShapePosition 语义对齐）
        if (params.width !== undefined) {
          var wv = parseFloat(params.width);
          if (isNaN(wv) || wv <= 0)
            return fail('无效的图片宽度: ' + params.width + '（必须为正数）');
          s.Width = wv;
        }
        if (params.height !== undefined) {
          var hv = parseFloat(params.height);
          if (isNaN(hv) || hv <= 0)
            return fail('无效的图片高度: ' + params.height + '（必须为正数）');
          s.Height = hv;
        }
        if (params.borderColor) {
          var bc = toRgb(params.borderColor);
          if (bc === null) return fail('无效的边框颜色: ' + params.borderColor);
          s.Line.Visible = 1;
          s.Line.ForeColor.RGB = bc;
        }
        // borderWidth 显式数值校验（与 setShapeBorder 语义对齐）
        if (params.borderWidth !== undefined) {
          var bw = parseFloat(params.borderWidth);
          if (isNaN(bw) || bw <= 0)
            return fail('无效的边框粗细: ' + params.borderWidth + '（必须为正数）');
          s.Line.Weight = bw;
        }
        return ok({});
      }
    }
    return fail('未找到图片: ' + shapeName);
  } catch (e) {
    return fail('设置图片样式失败: ' + e.message);
  }
});

registerHandler('setBackgroundColor', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    // slideIndex 显式校验（与 resolveSlideIndex 语义对齐，越界 Slides.Item 抛费解错误）
    var idx = resolveSlideIndex(pres, params.slideIndex);
    if (idx === null)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    // 非法颜色必须明确 fail（与 setSlideBackground 语义一致），不能用 || 0xFFFFFF 静默兜底——AI 传错色值会"静默变白"误导
    var bg = toRgb(params.color);
    if (bg === null) return fail('无效的背景颜色: ' + params.color + '，支持 #RRGGBB/RRGGBB/数字');
    slide.FollowMasterBackground = 0;
    slide.Background.Fill.ForeColor.RGB = bg;
    slide.Background.Fill.Visible = 1;
    return ok({});
  } catch (e) {
    return fail('设置背景颜色失败: ' + e.message);
  }
});

registerHandler('setBackgroundImage', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    // slideIndex 显式校验（与 resolveSlideIndex 语义对齐）
    var idx = resolveSlideIndex(pres, params.slideIndex);
    if (idx === null)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var filePath = params.path || params.imagePath;
    if (!filePath) return invalidParam('缺少 path');
    var slide = pres.Slides.Item(idx);
    slide.FollowMasterBackground = 0;
    slide.Background.Fill.UserPicture(filePath);
    return ok({});
  } catch (e) {
    return fail('设置背景图片失败: ' + e.message);
  }
});

registerHandler('setBackgroundGradient', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    // slideIndex 显式校验（与 resolveSlideIndex 语义对齐）
    var idx = resolveSlideIndex(pres, params.slideIndex);
    if (idx === null)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    slide.FollowMasterBackground = 0;
    slide.Background.Fill.OneColorGradient(1, 1, 0.5);
    return ok({});
  } catch (e) {
    return fail('设置渐变背景失败: ' + e.message);
  }
});

registerHandler('setShapeGradient', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var shapeName = params.shapeName || params.name;
    // shapeName 前置校验（与 setShapeStyle 语义对齐）
    if (!shapeName) return invalidParam('缺少 shapeName');
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      var s = slide.Shapes.Item(j);
      if (s.Name === shapeName) {
        s.Fill.OneColorGradient(1, 1, 0.5);
        return ok({});
      }
    }
    return fail('未找到形状: ' + shapeName);
  } catch (e) {
    return fail('设置形状渐变失败: ' + e.message);
  }
});

registerHandler('setShapeFullStyle', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var shapeName = params.shapeName || params.name;
    if (!shapeName) return invalidParam('缺少 shapeName');
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      var s = slide.Shapes.Item(j);
      if (s.Name === shapeName) {
        if (params.fillColor) {
          var fc = toRgb(params.fillColor);
          if (fc === null) return fail('无效的填充颜色: ' + params.fillColor);
          s.Fill.ForeColor.RGB = fc;
          s.Fill.Visible = 1;
        }
        if (params.lineColor) {
          var lc = toRgb(params.lineColor);
          if (lc === null) return fail('无效的线条颜色: ' + params.lineColor);
          s.Line.ForeColor.RGB = lc;
          s.Line.Visible = 1;
        }
        // lineWeight 显式数值校验（与 setShapeBorder 语义对齐）
        if (params.lineWeight !== undefined) {
          var lw = parseFloat(params.lineWeight);
          if (isNaN(lw) || lw <= 0)
            return fail('无效的线条粗细: ' + params.lineWeight + '（必须为正数）');
          s.Line.Weight = lw;
        }
        if (params.shadow) {
          s.Shadow.Visible = 1;
        }
        return ok({});
      }
    }
    return fail('未找到形状: ' + shapeName);
  } catch (e) {
    return fail('设置形状完整样式失败: ' + e.message);
  }
});

registerHandler('setShapeRoundness', function (params) {
  try {
    var pres = getPPT();
    if (!pres) return fail('没有打开的演示文稿');
    var idx = safeSlideIndex(pres, params.slideIndex);
    if (idx === -1)
      return fail(
        '无效的幻灯片索引: ' + params.slideIndex + '（合法范围 1~' + pres.Slides.Count + '）'
      );
    var slide = pres.Slides.Item(idx);
    var shapeName = params.shapeName || params.name;
    // shapeName 前置校验：双参都缺时循环空转后「未找到形状」误导（与 setShapeZOrder 语义对齐）
    if (!shapeName) return invalidParam('缺少 shapeName');
    for (var j = 1; j <= slide.Shapes.Count; j++) {
      var s = slide.Shapes.Item(j);
      if (s.Name === shapeName) {
        // 仅圆角矩形（msoShapeRoundedRectangle=5）支持圆角调整，其它形状无 Adjustments 或类型不匹配
        if (s.Type !== 5 && s.AutoShapeType !== 5) {
          return fail('仅支持对圆角矩形设置圆角，当前形状类型: ' + s.Type);
        }
        // WPS JSAPI 写法：Item(索引, 值) 传第二参数（与 Mac 版 opencode-wps-assistant 一致），
        // 不能用 Item(1) = value 赋值（那是 VBA 语法，JS 运行时必报 Invalid left-hand side）
        // roundness 显式数值校验：0~1 范围（与 setShapeTransparency 语义对齐），字符串直赋抛类型错误
        var roundness = params.roundness !== undefined ? parseFloat(params.roundness) : 0.2;
        if (isNaN(roundness) || roundness < 0 || roundness > 1)
          return fail('无效的圆角值: ' + params.roundness + '（必须在 0~1 之间）');
        try {
          s.Adjustments.Item(1, roundness);
        } catch (adjE) {
          return fail('设置圆角失败: ' + adjE.message);
        }
        return ok({});
      }
    }
    return fail('未找到形状: ' + shapeName);
  } catch (e) {
    return fail('设置形状圆角失败: ' + e.message);
  }
});

registerHandler('setFontColor', function (params) {
  try {
    var pres = Application.ActivePresentation;
    if (!pres) return fail('没有打开的演示文稿');
    // slideIndex 显式校验：越界 Slides.Item 抛费解错误（与 resolveSlideIndex 语义对齐）
    var slideIndex = params.slideIndex;
    var idx = resolveSlideIndex(pres, slideIndex);
    if (idx === null)
      return fail('无效的幻灯片索引: ' + slideIndex + '（合法范围 1~' + pres.Slides.Count + '）');
    var slide = pres.Slides.Item(idx);
    var shape = findShape(
      slide,
      params.shapeIndex !== undefined ? params.shapeIndex : params.shapeName
    );
    if (!shape) return fail('未找到形状');
    var textRange = shape.TextFrame.TextRange;
    // PPT ForeColor.RGB 需要 RGB 顺序（非 BGR），统一走 toRgb（数字直返/字符串解析/非法 fail）
    var color = toRgb(params.color);
    if (color === null) return fail('无效的颜色值: ' + params.color + '，支持 #RRGGBB/RRGGBB/数字');
    textRange.Font.Color.RGB = color;
    // size 显式数值校验：字符串/'16pt' 直赋抛类型错误（与 setTextBoxStyle 语义对齐）
    if (params.size !== undefined) {
      var sz = parseFloat(params.size);
      if (isNaN(sz) || sz <= 0) return fail('无效的字体大小: ' + params.size + '（必须为正数）');
      textRange.Font.Size = sz;
    }
    if (params.bold !== undefined) textRange.Font.Bold = params.bold;
    return ok({});
  } catch (e) {
    return fail('设置字体颜色失败: ' + e.message);
  }
});

registerHandler('setSlideSize', function (params) {
  try {
    var pres = Application.ActivePresentation;
    if (!pres) return fail('没有打开的演示文稿');
    // 显式数值转换 + 校验（避免字符串宽度被真值判断放行后 COM 抛类型错误；width=0 非法）
    if (params.width !== undefined) {
      var w = parseInt(params.width, 10);
      if (isNaN(w) || w <= 0) return fail('无效的幻灯片宽度: ' + params.width + '（必须为正数）');
      pres.PageSetup.SlideWidth = w;
    }
    if (params.height !== undefined) {
      var h = parseInt(params.height, 10);
      if (isNaN(h) || h <= 0) return fail('无效的幻灯片高度: ' + params.height + '（必须为正数）');
      pres.PageSetup.SlideHeight = h;
    }
    return ok({});
  } catch (e) {
    return fail('设置幻灯片大小失败: ' + e.message);
  }
});

registerHandler('setShapeFill', function (params) {
  try {
    var pres = Application.ActivePresentation;
    if (!pres) return fail('没有打开的演示文稿');
    // slideIndex 显式校验：越界 Slides.Item 抛费解错误（与 resolveSlideIndex 语义对齐）
    var slideIndex = params.slideIndex;
    var idx = resolveSlideIndex(pres, slideIndex);
    if (idx === null)
      return fail('无效的幻灯片索引: ' + slideIndex + '（合法范围 1~' + pres.Slides.Count + '）');
    var slide = pres.Slides.Item(idx);
    var shape = findShape(
      slide,
      params.shapeIndex !== undefined ? params.shapeIndex : params.shapeName
    );
    if (!shape) return fail('未找到形状');
    if (params.fillColor !== undefined) {
      var color = toRgb(params.fillColor);
      if (color === null)
        return fail('无效的填充颜色: ' + params.fillColor + '，支持 #RRGGBB/RRGGBB/数字');
      shape.Fill.ForeColor.RGB = color;
    }
    if (params.transparency !== undefined) {
      // 透明度显式校验：0~1 范围（与 setShapeTransparency 第 1 轮修复对齐），字符串/越界显式 fail
      var tp = parseFloat(params.transparency);
      if (isNaN(tp) || tp < 0 || tp > 1)
        return fail('无效的透明度: ' + params.transparency + '（必须在 0~1 之间）');
      shape.Fill.Transparency = tp;
    }
    if (params.gradient !== undefined) {
      // gradient 对象必须含 style（OneColorGradient(undefined) 抛费解错误），variant/degree 数值化
      var gstyle = params.gradient.style !== undefined ? parseFloat(params.gradient.style) : NaN;
      if (isNaN(gstyle) || gstyle < 1) return fail('无效的渐变 style: ' + params.gradient.style);
      var gvariant =
        params.gradient.variant !== undefined ? parseFloat(params.gradient.variant) : 1;
      if (isNaN(gvariant) || gvariant < 1)
        return fail('无效的渐变 variant: ' + params.gradient.variant);
      var gdegree = params.gradient.degree !== undefined ? parseFloat(params.gradient.degree) : 1;
      if (isNaN(gdegree) || gdegree < 0)
        return fail('无效的渐变 degree: ' + params.gradient.degree);
      shape.Fill.OneColorGradient(gstyle, gvariant, gdegree);
    }
    return ok({});
  } catch (e) {
    return fail('设置形状填充失败: ' + e.message);
  }
});

registerHandler('setSlideTheme', function (params) {
  try {
    var pres = Application.ActivePresentation;
    if (!pres) return fail('没有打开的演示文稿');
    // theme 前置校验：ApplyTemplate(undefined) 抛类型错误（与 setSlideSize 校验语义对齐）
    var theme = params.theme;
    if (typeof theme !== 'string' || !theme) return invalidParam('缺少 theme（主题/模板路径）');
    if (typeof pres.ApplyTemplate === 'function') {
      pres.ApplyTemplate(theme);
    } else if (typeof pres.ApplyTheme === 'function') {
      pres.ApplyTheme(theme);
    } else {
      return fail('此 WPS 版本不支持 ApplyTemplate/ApplyTheme');
    }
    return ok({});
  } catch (e) {
    return fail('设置主题失败: ' + e.message);
  }
});
