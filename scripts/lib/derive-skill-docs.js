'use strict';

/**
 * 单一来源方案 C：将 skill 引用的根 docs/ 设计文档派生进该 skill 目录。
 *
 * 背景：wps-proofread 的 SKILL.md 用相对路径 `docs/xxx.md` 引用设计文档。
 * 历史 B2 曾将根 docs/ 的两个文件 git 复制进 skills/wps-proofread/docs/，形成
 * 双份镜像，根 docs/ 改动后必须手工同步 skill 内副本，否则运行时断链/漂移。
 *
 * 方案 C：根 docs/ 为唯一事实来源；安装期（install-addons*.js 拷贝 skill 后）从
 * 根 docs/ 把 SKILL.md 引用的同名文件派生进目标 skill 的 docs/ 子目录，git 层
 * 不再保留双份。消除镜像漂移负担。
 *
 * 派生是**幂等自愈**的：目标 skill 的 docs/ 子目录完全由本派生创建/维护，无其他
 * 写入方。派生前会清理其中**根 docs/ 有同名源、但不在当前引用集**的旧派生产物
 * （根 docs/ 删除某设计文档后，安装目录不留幽灵文档），保证安装结果与单一来源收敛一致；
 * 对根 docs/ 无同名源的 dest .md 视为 skill 自带内容保守保留。
 *
 * 单一实现源：三个平台安装脚本共用本模块，保证派生规则一致，避免多处重复实现；
 * SKILL.md 文档引用的解析复用 collectSkillDocRefs，杜绝双写。
 *
 * @param {object} ctx  上下文
 * @param {string} ctx.rootDir        仓库根目录
 * @param {string} ctx.skillSrcDir    skill 源目录（含 SKILL.md）
 * @param {string} ctx.skillDestDir   已拷贝的目标 skill 目录（将被写入 docs/ 派生）
 * @returns {{ derived: number, unmet: string[] }} 派生文件数与未满足的引用清单
 */
function deriveSkillDocs({ rootDir, skillSrcDir, skillDestDir }) {
  const fs = require('fs');
  const fsEx = require('fs-extra');
  const path = require('path');
  const { collectSkillDocRefs } = require(path.join(__dirname, 'skill-doc-refs.js'));

  const refs = collectSkillDocRefs(path.join(skillSrcDir, 'SKILL.md'));

  // 1) 自愈：清理"根 docs/ 存在同名源、但当前不再被引用"的旧派生产物。
  //    仅删除确认为根 docs 镜像的 dest .md（根 docs/ 有同名源），对根 docs/ 无同名源
  //    的 dest .md 视为 skill 自带内容保守保留，避免误删。
  const destDocsDir = path.join(skillDestDir, 'docs');
  if (fs.existsSync(destDocsDir)) {
    fs.readdirSync(destDocsDir)
      .filter(f => f.endsWith('.md'))
      .forEach(f => {
        const rel = path.join('docs', f);
        const rootMirror = fs.existsSync(path.join(rootDir, rel));
        if (rootMirror && !refs.has(rel)) {
          fsEx.removeSync(path.join(destDocsDir, f));
          // eslint-disable-next-line no-console
          console.log('    清理失效 skill 文档: ' + rel);
        }
      });
  }

  if (refs.size === 0) return { derived: 0, unmet: [] };

  // 2) 派生当前引用
  const unmet = [];
  let derived = 0;
  refs.forEach(rel => {
    // rel 形如 "docs/xxx.md"，根事实源文件 = rootDir/rel
    const srcFile = path.join(rootDir, rel);
    const destFile = path.join(skillDestDir, rel);
    if (fs.existsSync(srcFile)) {
      fsEx.ensureDirSync(path.dirname(destFile));
      fsEx.copySync(srcFile, destFile, { overwrite: true });
      derived += 1;
      // eslint-disable-next-line no-console
      console.log('    派生 skill 文档: ' + rel);
    } else if (!fs.existsSync(destFile)) {
      // 根 docs 无此文件且目标也不存在 → 安装后 skill 会断链，归入 unmet 交由调用方提示
      unmet.push(rel);
    }
  });
  return { derived, unmet };
}

module.exports = { deriveSkillDocs };
