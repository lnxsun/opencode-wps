#!/usr/bin/env node
/**
 * 校验仓库内版本号一致性
 *
 * 背景：历史上版本号在多处漂移——manifest.xml 曾同时存在
 * <Version>1.1.0</Version> 与 <version>1.0.0</version> 两个字段，
 * opencode-wps/package.json 与 wps-office-mcp/package.json 也各执一词。
 * 本脚本在 CI 中（.cnb.yml 的 Validate stage 与 .github/workflows/ci.yml）执行，
 * 作为版本一致性回归的最后防线。
 *
 * 用法：node scripts/validate-versions.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const errors = [];

// 单一版本源：根 package.json
const rootPkg = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')
);
const EXPECTED = rootPkg.version;
if (!/^\d+\.\d+\.\d+$/.test(EXPECTED)) {
  errors.push(`根 package.json 版本号「${EXPECTED}」格式非法（应为 x.y.z）`);
}

function checkFile(label, file, version) {
  if (version !== EXPECTED) {
    errors.push(`${label} (${file}) 版本「${version}」与根 package.json「${EXPECTED}」不一致`);
  } else {
    console.log(`  ✓ ${label}: ${version}`);
  }
}

// ---- 1. package.json / package-lock.json ----
checkFile(
  'opencode-wps/package.json',
  'opencode-wps/package.json',
  JSON.parse(fs.readFileSync(path.join(rootDir, 'opencode-wps/package.json'), 'utf8')).version
);

const mcpPkg = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'wps-office-mcp/package.json'), 'utf8')
);
checkFile('wps-office-mcp/package.json', 'wps-office-mcp/package.json', mcpPkg.version);

const mcpLock = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'wps-office-mcp/package-lock.json'), 'utf8')
);
checkFile('wps-office-mcp/package-lock.json (顶层)', 'wps-office-mcp/package-lock.json', mcpLock.version);
const lockPkg = mcpLock.packages && mcpLock.packages[''];
if (lockPkg) {
  checkFile('wps-office-mcp/package-lock.json (packages[""])', 'wps-office-mcp/package-lock.json', lockPkg.version);
}

// ---- 2. config.js（CONFIG.version）----
const configSrc = fs.readFileSync(path.join(rootDir, 'opencode-wps/config.js'), 'utf8');
const configVerMatch = configSrc.match(/version\s*:\s*['"](\d+\.\d+\.\d+)['"]/);
if (!configVerMatch) {
  errors.push('opencode-wps/config.js 中未找到 version: "x.y.z"');
} else {
  checkFile('opencode-wps/config.js (CONFIG.version)', 'opencode-wps/config.js', configVerMatch[1]);
}

// ---- 3. manifest.xml（<Version> 大写字段）----
const manifestSrc = fs.readFileSync(path.join(rootDir, 'opencode-wps/manifest.xml'), 'utf8');
const verMatch = manifestSrc.match(/<Version>\s*(\d+\.\d+\.\d+)\s*<\/Version>/);
if (!verMatch) {
  errors.push('opencode-wps/manifest.xml 中未找到 <Version>x.y.z</Version>');
} else {
  checkFile('opencode-wps/manifest.xml (<Version>)', 'opencode-wps/manifest.xml', verMatch[1]);
}

// manifest.xml 不应再有冗余的小写 <version> 字段（历史遗留）
if (/<version>\s*\d/.test(manifestSrc)) {
  errors.push('opencode-wps/manifest.xml 中存在冗余的小写 <version> 字段，请删除（只保留 <Version>）');
}

// ---- 4. 汇总 ----
if (errors.length > 0) {
  console.error('\n❌ 版本一致性校验失败:');
  errors.forEach(e => console.error('   - ' + e));
  process.exit(1);
}
console.log(`\n✅ 所有版本一致：${EXPECTED}`);
