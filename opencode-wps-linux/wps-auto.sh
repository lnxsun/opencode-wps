#!/bin/bash
# OpenCode AI - WPS 应用自动切换脚本 (Linux)
# 用于自动关闭当前 WPS 并启动指定应用（文字/表格/演示）
#
# Linux 版 WPS 安装后提供独立命令：
#   wps  -> WPS 文字 (Writer)
#   et   -> WPS 表格 (Spreadsheet)
#   wpp  -> WPS 演示 (Presentation)
# 若命令不存在，则回退到 xdg-open 打开空白 Office 文件。

create_blank_file() {
    local file_type=$1
    # 用 $$（当前 shell PID）做临时文件后缀，避免并发 start_app（MCP 并发命令可同时触发）互相 rm/覆盖固定路径（第 18 轮评审 info）
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
            # 纯标准库 zipfile 手写最小 pptx（避免依赖第三方 python-pptx）
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
    # 精确匹配进程名（pkill -x），避免 -f 匹配完整命令行误杀无关进程（如 wpscan/ethtool 或含 wps 子串的 Node 进程）
    # 兼容带版本后缀的进程名变体（如 wps-12.1.2 / et-office6 / wpp 等），用 -f 但限定 WPS 安装路径
    for name in "wps" "et" "wpp" "wpsoffice" "wpspdf"; do
        pkill -x "$name" 2>/dev/null || true
    done
    # 再按 WPS 专属安装路径匹配（/opt/kingsoft/wps 等），只杀 WPS 家族进程；
    # 兼容可执行文件名带版本后缀的变体（pkill -f 匹配完整命令行，但限定 /kingsoft/ 路径避免误杀）
    pkill -f "/kingsoft/(wps|et|wpp|wpsoffice|wpspdf)" 2>/dev/null || true
    # 轮询确认所有 WPS 进程退出（最多 10s），避免慢速退出/保存对话框场景进程残留导致启动新应用冲突
    local waited=0
    while [ $waited -lt 10 ]; do
        if ! pgrep -f "/kingsoft/(wps|et|wpp|wpsoffice|wpspdf)" >/dev/null 2>&1 && \
           ! pgrep -x "wps" >/dev/null 2>&1 && ! pgrep -x "et" >/dev/null 2>&1 && \
           ! pgrep -x "wpp" >/dev/null 2>&1 && ! pgrep -x "wpsoffice" >/dev/null 2>&1 && \
           ! pgrep -x "wpspdf" >/dev/null 2>&1; then
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
    local app_cmd=""

    case $app_type in
        "et"|"excel")
            echo "[WPS-Auto] 启动 WPS 表格..."
            file_path=$(create_blank_file "xlsx")
            app_cmd="et"
            ;;
        "wps"|"word")
            echo "[WPS-Auto] 启动 WPS 文字..."
            file_path=$(create_blank_file "docx")
            app_cmd="wps"
            ;;
        "wpp"|"ppt")
            echo "[WPS-Auto] 启动 WPS 演示..."
            file_path=$(create_blank_file "pptx")
            app_cmd="wpp"
            ;;
        *)
            echo "[WPS-Auto] 未知应用: $app_type"
            return 1
            ;;
    esac

    # 优先使用 WPS 原生命令；不存在时回退 xdg-open
    if command -v "$app_cmd" >/dev/null 2>&1; then
        if [ -n "$file_path" ] && [ -f "$file_path" ]; then
            nohup "$app_cmd" "$file_path" >/dev/null 2>&1 &
        else
            # 无 python3 或生成失败：直接以无参方式启动 WPS（新建空白文档）
            nohup "$app_cmd" >/dev/null 2>&1 &
        fi
    elif command -v xdg-open >/dev/null 2>&1; then
        if [ -n "$file_path" ] && [ -f "$file_path" ]; then
            nohup xdg-open "$file_path" >/dev/null 2>&1 &
        else
            echo "[WPS-Auto] 未生成空白文件且无 python3，无法用 xdg-open 启动: $app_cmd"
            return 1
        fi
    else
        echo "[WPS-Auto] 未找到启动命令: $app_cmd / xdg-open"
        return 1
    fi
    return 0
}

switch_to() {
    local target=$1
    close_all
    # close_all 已内置退出确认（最多 10s），此处不再额外 sleep
    if ! start_app "$target"; then
        echo "[WPS-Auto] 切换失败: 未知应用 $target" >&2
        return 1
    fi
    # 就绪确认：轮询等待目标应用进程存活（最多 10s），避免固定 sleep 3 在慢速机器上
    # WPS 加载项还没连接时 MCP 命令就已发出（导致 30s 超时）
    # target 是 excel/word/ppt（或 et/wps/wpp），需映射到进程名
    local proc_name="$target"
    case "$target" in
        "excel") proc_name="et" ;;
        "word") proc_name="wps" ;;
        "ppt") proc_name="wpp" ;;
    esac
    local waited=0
    while [ $waited -lt 10 ]; do
        # 精确匹配 + 版本后缀变体（et-office6/wps-12.1.2/wpsoffice）都要识别，
        # 与 keepalive 的边界匹配语义一致（pgrep -x 精确名 / pgrep -f 限定 /kingsoft/ 路径）
        if pgrep -x "$proc_name" >/dev/null 2>&1 || \
           pgrep -f "/kingsoft/.*$proc_name" >/dev/null 2>&1 || \
           pgrep -x "wpsoffice" >/dev/null 2>&1; then
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
        switch_to "$2"
        ;;
    "start")
        start_app "$2"
        ;;
    "stop"|"close")
        close_all
        ;;
    *)
        echo "OpenCode AI WPS 自动切换脚本 (Linux)"
        echo "用法:"
        echo "  $0 switch <app>   切换到指定应用 (excel/word/ppt)"
        echo "  $0 start <app>    启动指定应用"
        echo "  $0 stop           关闭所有 WPS"
        ;;
esac
