#!/bin/bash
# OpenCode AI - WPS 应用自动切换脚本 (Mac)
# 用于自动关闭当前 WPS 并启动指定应用（Word/Excel/PPT）

SERVER_URL="http://127.0.0.1:58891"
POLL_TIMEOUT=30
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

create_blank_file() {
    local file_type=$1
    local file_path="/tmp/opencode_auto_blank"

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
            python3 -c "
from pptx import Presentation
p = Presentation()
p.slides.add_slide(p.slide_layouts[6])
p.save('${file_path}.pptx')
" 2>/dev/null
            echo "${file_path}.pptx"
            ;;
    esac
}

close_all() {
    echo "[WPS-Auto] 关闭所有 WPS 应用..."
    for name in "wpsoffice" "WPS" "com.kingsoft.wpsoffice.mac" "WPS Office"; do
        pkill -f "$name" 2>/dev/null || true
    done
    sleep 2
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

    open "$file_path" 2>/dev/null
    return 0
}

switch_to() {
    local target=$1
    close_all
    sleep 2
    start_app "$target"
    sleep 3
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
        echo "OpenCode AI WPS 自动切换脚本"
        echo "用法:"
        echo "  $0 switch <app>   切换到指定应用 (excel/word/ppt)"
        echo "  $0 start <app>    启动指定应用"
        echo "  $0 stop           关闭所有 WPS"
        ;;
esac
