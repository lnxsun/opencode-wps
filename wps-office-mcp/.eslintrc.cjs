/**
 * ESLint 配置（wps-office-mcp）
 *
 * 背景：Issue #185 补建 MCP 的 ESLint 静态规则检查。此前 lint 脚本
 * （eslint src 下的 ts 文件）是「僵尸脚本」——无 eslint 依赖、无配置文件，从未真实运行。
 *
 * 选型说明：
 * - 使用 ESLint 8（.eslintrc.cjs，CommonJS 导出，与项目 CJS 风格一致）。
 * - 仅启用 @typescript-eslint/recommended（非 type-aware 子集），不启用
 *   parserOptions.project——因为 tsconfig 排除了测试文件，type-aware 会把
 *   测试文件排除在 project 外导致报错；非 type-aware 纯语法规则稳定可跑。
 *
 * 规则裁剪说明（务实、最小必要）：
 * 仓库大量既有脚本沿用 ES5 var 风格（见根目录 scripts/lint-js.js 说明）。
 * 为让 ESLint 真实可跑且不因历史代码包袱阻塞 CI，对与既有风格强冲突、
 * 且不属于本次范围的规则关闭或降级；保留能真实校验代码质量的推荐规则，
 * 使 lint 对新代码持续生效。
 */
'use strict';

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    // ---- 与既有代码风格冲突，关闭以避免海量误报（历史包袱，非本次范围）----
    'no-var': 'off', // 项目大量 ES5 var 风格
    'prefer-const': 'off', // 既有 let/var 不强制 const
    'no-case-declarations': 'off', // switch case 内声明（既有代码）
    '@typescript-eslint/no-require-imports': 'off', // CommonJS 项目测试文件用 require
    '@typescript-eslint/ban-ts-comment': 'off', // 既有 @ts-ignore 用法
    'no-useless-escape': 'off', // 既有转义写法（如 \"、\。）

    // ---- 变量未使用 ----
    'no-unused-vars': 'off', // 用 TS 版替代，避免冲突
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
    ],

    // ---- 允许显式 any（收敛但不阻塞，warning 提示）----
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  overrides: [
    {
      // 测试文件：识别 jest 全局（describe/it/expect）
      files: ['*.test.ts', 'tests/**/*.ts'],
      env: {
        jest: true,
      },
    },
  ],
};
