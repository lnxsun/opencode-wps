#!/bin/bash
# OpenCode AI - WPS 应用自动切换脚本 (Mac)
# 用于自动关闭当前 WPS 并启动指定应用（Word/Excel/PPT）

create_blank_file() {
    local file_type=$1
    # 用 $$（当前 shell PID）做临时文件后缀，避免并发 start_app（MCP 并发命令可同时触发）互相 rm/覆盖固定路径
    local file_path="/tmp/opencode_auto_blank_$$"

    # 前置检查：需要 python3 生成 OOXML 文件；缺失时返回空（调用方回退无参启动）
    if ! command -v python3 >/dev/null 2>&1; then
        echo "[WPS-Auto] 警告: 未找到 python3，无法生成空白 Office 文件" >&2
        return 1
    fi

    # 清理本 PID 的旧临时文件（不再 rm 全局固定路径，避免影响并发实例）
    rm -f "${file_path}.xlsx" "${file_path}.docx" "${file_path}.pptx"

    case $file_type in
        "xlsx")
            python3 -c "
import zipfile
with zipfile.ZipFile('${file_path}.xlsx', 'w') as zf:
    zf.writestr('[Content_Types].xml', '<?xml version=\"1.0\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/></Types>')
    zf.writestr('_rels/.rels', '<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>')
    zf.writestr('xl/workbook.xml', '<?xml version=\"1.0\"?><workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheets><sheet name=\"Sheet1\" sheetId=\"1\" r:id=\"rId1\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"/></sheets></workbook>')
    zf.writestr('xl/_rels/workbook.xml.rels', '<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/></Relationships>')
    zf.writestr('xl/worksheets/sheet1.xml', '<?xml version=\"1.0\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData/></worksheet>')
" 2>/dev/null
            echo "${file_path}.xlsx"
            ;;
        "docx")
            python3 -c "
import zipfile
with zipfile.ZipFile('${file_path}.docx', 'w') as zf:
    zf.writestr('[Content_Types].xml', '<?xml version=\"1.0\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>')
    zf.writestr('_rels/.rels', '<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>')
    zf.writestr('word/document.xml', '<?xml version=\"1.0\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body><w:p><w:r><w:t></w:t></w:r></w:p></w:body></w:document>')
" 2>/dev/null
            echo "${file_path}.docx"
            ;;
        "pptx")
            # 纯标准库 zipfile 手写最小 pptx（避免依赖第三方 python-pptx，Mac 上未预装）
            python3 -c "
import zipfile
with zipfile.ZipFile('${file_path}.pptx', 'w') as zf:
    zf.writestr('[Content_Types].xml', '<?xml version=\"1.0\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/ppt/presentation.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml\"/><Override PartName=\"/ppt/slides/slide1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.slide+xml\"/><Override PartName=\"/ppt/slideLayouts/slideLayout1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml\"/><Override PartName=\"/ppt/slideMasters/slideMaster1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml\"/></Types>')
    zf.writestr('_rels/.rels', '<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"ppt/presentation.xml\"/></Relationships>')
    zf.writestr('ppt/presentation.xml', '<?xml version=\"1.0\"?><p:presentation xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><p:sldMasterIdLst><p:sldMasterId id=\"2147483648\" r:id=\"rId1\"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id=\"256\" r:id=\"rId2\"/></p:sldIdLst><p:sldSz cx=\"9144000\" cy=\"6858000\"/></p:presentation>')
    zf.writestr('ppt/_rels/presentation.xml.rels', '<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster\" Target=\"slideMasters/slideMaster1.xml\"/><Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide\" Target=\"slides/slide1.xml\"/></Relationships>')
    zf.writestr('ppt/slideMasters/slideMaster1.xml', '<?xml version=\"1.0\"?><p:sldMaster xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMap bg1=\"lt1\" tx1=\"dk1\" bg2=\"lt2\" tx2=\"dk2\" accent1=\"accent1\" accent2=\"accent2\" accent3=\"accent3\" accent4=\"accent4\" accent5=\"accent5\" accent6=\"accent6\" hlink=\"hlink\" folHlink=\"folHlink\"/></p:sldMaster>')
    zf.writestr('ppt/slideLayouts/slideLayout1.xml', '<?xml version=\"1.0\"?><p:sldLayout xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" type=\"blank\"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\"/></p:clrMapOvr></p:sldLayout>')
    zf.writestr('ppt/slides/slide1.xml', '<?xml version=\"1.0\"?><p:sld xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\"/></p:clrMapOvr></p:sld>')
" 2>/dev/null
            echo "${file_path}.pptx"
            ;;
    esac
}

close_all() {
    echo "[WPS-Auto] 关闭所有 WPS 应用..."
    # 精确匹配进程名（pkill -x），避免 -f 匹配完整命令行误杀无关进程（如含 wps 子串的 Node 进程）
    # macOS 上 WPS 主进程名为 wpsoffice，附加进程含 wps 前缀变体（如 wpscloudsvr），
    # 用 -x 精确匹配 wpsoffice + com.kingsoft 前缀的辅助进程，避免误杀
    for name in "wpsoffice" "wps" "et" "wpp" "wpspdf"; do
        pkill -x "$name" 2>/dev/null || true
    done
    # macOS 辅助进程带 bundle 前缀，用 -f 但限定 com.kingsoft 路径匹配 WPS 家族（避免误杀）
    pkill -f "com.kingsoft.wpsoffice" 2>/dev/null || true
    # 轮询确认所有 WPS 进程退出（最多 10s），避免慢速退出/保存对话框场景进程残留导致启动新应用冲突
    local waited=0
    while [ $waited -lt 10 ]; do
        if ! pgrep -f "com.kingsoft.wpsoffice" >/dev/null 2>&1 && \
           ! pgrep -x "wpsoffice" >/dev/null 2>&1 && \
           ! pgrep -x "wps" >/dev/null 2>&1 && \
           ! pgrep -x "et" >/dev/null 2>&1 && \
           ! pgrep -x "wpp" >/dev/null 2>&1; then
            break
        fi
        sleep 1
        waited=$((waited + 1))
    done
    if [ $waited -ge 10 ]; then
        echo "[WPS-Auto] 警告: 等待 10s 后仍有 WPS 进程存活（可能有未保存文档对话框）" >&2
    fi
}

start_app() {
    local app_type=$1
    local file_path=""

    case $app_type in
        "et"|"excel")
            echo "[WPS-Auto] 启动 WPS 表格..."
            file_path=$(create_blank_file "xlsx")
            ;;
        "wps"|"word")
            echo "[WPS-Auto] 启动 WPS 文字..."
            file_path=$(create_blank_file "docx")
            ;;
        "wpp"|"ppt")
            echo "[WPS-Auto] 启动 WPS 演示..."
            file_path=$(create_blank_file "pptx")
            ;;
        *)
            echo "[WPS-Auto] 未知应用: $app_type"
            return 1
            ;;
    esac

    # macOS 用 open 打开空白文件启动对应应用（WPS 注册了 docx/xlsx/pptx 文件关联）
    if [ -n "$file_path" ] && [ -f "$file_path" ]; then
        open "$file_path" 2>/dev/null
    else
        # 无 python3 或生成失败：直接 open 应用（WPS 注册了 scheme）
        case $app_type in
            "et"|"excel") open -a "WPS Office" 2>/dev/null || open "wps:et" 2>/dev/null ;;
            "wps"|"word") open -a "WPS Office" 2>/dev/null || open "wps:wps" 2>/dev/null ;;
            "wpp"|"ppt")  open -a "WPS Office" 2>/dev/null || open "wps:wpp" 2>/dev/null ;;
        esac
    fi
    return 0
}

switch_to() {
    local target=$1
    close_all
    # close_all 已内置退出确认（最多 10s），此处不再额外 sleep
    if ! start_app "$target"; then
        # close_all 已关闭原应用——切换失败后用户处于无应用状态，必须给出明确恢复指引
        echo "[WPS-Auto] 切换失败: 未知应用 $target，原应用已关闭，请手动重新打开 WPS" >&2
        return 1
    fi
    # 就绪确认：轮询等待目标应用进程存活（最多 10s），避免固定 sleep 3 在慢速机器上
    # WPS 加载项还没连接时 MCP 命令就已发出（导致 30s 超时）
    local proc_name="$target"
    case "$target" in
        "excel") proc_name="et" ;;
        "word") proc_name="wps" ;;
        "ppt") proc_name="wpp" ;;
    esac
    local waited=0
    while [ $waited -lt 10 ]; do
        if pgrep -x "$proc_name" >/dev/null 2>&1 || \
           pgrep -x "wpsoffice" >/dev/null 2>&1 || \
           pgrep -f "com.kingsoft.wpsoffice" >/dev/null 2>&1; then
            break
        fi
        sleep 1
        waited=$((waited + 1))
    done
    # 目标命令名与进程名可能不同（如 wps 命令→wpsoffice 进程），再兜底等 2s 让加载项初始化
    sleep 2
}

case $1 in
    "switch")
        # app 参数缺失时直接报错退出，避免误执行 close_all 关掉已打开文档
        if [ -z "$2" ]; then
            echo "[WPS-Auto] 错误: switch 需要指定应用 (excel/word/ppt)" >&2
            exit 2
        fi
        switch_to "$2"
        ;;
    "start")
        if [ -z "$2" ]; then
            echo "[WPS-Auto] 错误: start 需要指定应用 (excel/word/ppt)" >&2
            exit 2
        fi
        start_app "$2"
        ;;
    "stop"|"close")
        # 幂等：先探测是否有 WPS 进程（含 wpspdf，与 close_all 的 pkill 清单一致），无则直接退出（避免 pkill 空转 + 10s 轮询等待）
        if ! pgrep -x "wpsoffice" >/dev/null 2>&1 && \
           ! pgrep -x "wps" >/dev/null 2>&1 && \
           ! pgrep -x "et" >/dev/null 2>&1 && \
           ! pgrep -x "wpp" >/dev/null 2>&1 && \
           ! pgrep -x "wpspdf" >/dev/null 2>&1 && \
           ! pgrep -f "com.kingsoft.wpsoffice" >/dev/null 2>&1; then
            echo "[WPS-Auto] 无 WPS 进程，跳过关闭"
            exit 0
        fi
        close_all
        ;;
    *)
        echo "OpenCode AI WPS 自动切换脚本 (Mac)"
        echo "用法:"
        echo "  $0 switch <app>   切换到指定应用 (excel/word/ppt)"
        echo "  $0 start <app>    启动指定应用"
        echo "  $0 stop           关闭所有 WPS"
        ;;
esac
