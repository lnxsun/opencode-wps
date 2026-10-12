/**
 * Handler 注册中心
 * 所有 handler 模块通过 registerHandler 注册自己处理的动作
 * main.js 通过 HANDLERS[action] 分发命令
 */
var HANDLERS = {};

function registerHandler(action, handlerFn) {
  HANDLERS[action] = handlerFn;
}

function getHandler(action) {
  return HANDLERS[action];
}
