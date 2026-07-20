/**
 * 标准化响应封装工具
 * 所有 handler 必须通过此工具返回统一格式的结果
 */
function ok(data) {
    return { success: true, data: data || null, error: null };
}

function fail(msg) {
    return { success: false, data: null, error: msg || '未知错误' };
}

function invalidParam(msg) {
    return { success: false, data: null, error: '参数错误: ' + (msg || '请检查输入参数') };
}

function notImpl(action) {
    return { success: false, data: null, error: '未实现: ' + action };
}
