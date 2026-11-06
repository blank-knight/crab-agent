// 技能广场/市场（qiji 自研）：从 GitHub 或自有服务器下载 zip → 解压 →
// 定位 SKILL.md → 安装到 skills/market/{name}/。我们服务器零参与——货在
// GitHub,作者是唯一维护方。
// 上游同步注意：qiji 隔离区模块（见 electron/qiji/brand.ts 头注）。
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { app, ipcMain, net } from 'electron'
import type { ClientRequest, IncomingMessage } from 'electron'

// electron 40 的 d.ts 把 IncomingMessage 声明为纯 NodeEventEmitter(无流方法),
// 但运行时它是 Readable。交叉类型如实描述。
type NetResponse = IncomingMessage & NodeJS.ReadableStream

export interface SkillMarketDeps {
  hermesHome: string
  rememberLog: (text: string) => void
}

function doGetZip(url: string, zipPath: string, headers: Record<string, string>, redirects: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const req: ClientRequest = net.request(url)

    for (const k of Object.keys(headers)) {
      req.setHeader(k, headers[k])
    }
    req.on('response', (res: NetResponse) => {
      const st = res.statusCode
      const loc = res.headers.location

      if (st >= 300 && st < 400 && loc && redirects > 0) {
        res.resume()

        return resolve(doGetZip(new URL(String(loc), url).toString(), zipPath, headers, redirects - 1))
      }

      if (st !== 200) {
        res.resume()

        // main 不存在 → 试 master(老仓库惯例)
        if (st === 404 && url.endsWith('/zip/refs/heads/main')) {
          return resolve(doGetZip(url.replace('/main', '/master'), zipPath, headers, redirects))
        }

        return reject(new Error(`GitHub 下载失败(HTTP ${st})——检查仓库名或网络`))
      }

      const out = fs.createWriteStream(zipPath)
      res.pipe(out)
      out.on('finish', () => out.close(() => resolve()))
      out.on('error', reject)
    })
    req.on('error', e => reject(new Error('网络错误: ' + e.message)))
    req.end()
  })
}

function extractZip(zipPath: string, extractDir: string): void {
  const untar =
    process.platform === 'win32'
      ? ['tar', '-xf', zipPath, '-C', extractDir]
      : ['unzip', '-q', zipPath, '-d', extractDir]

  try {
    execFileSync(untar[0], untar.slice(1), { stdio: 'ignore' })
  } catch (e) {
    throw new Error('解压失败: ' + ((e as Error).message || e))
  }
}

function findSkillDirs(dir: string, depth: number): string[] {
  const out: string[] = []

  if (depth > 4) {
    return out
  }

  if (fs.existsSync(path.join(dir, 'SKILL.md'))) {
    out.push(dir)
  }

  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.isDirectory() && !f.name.startsWith('.') && f.name !== 'node_modules') {
      out.push(...findSkillDirs(path.join(dir, f.name), depth + 1))
    }
  }

  return out
}

export function registerQijiSkillMarketIpc({ hermesHome, rememberLog }: SkillMarketDeps): void {
  ipcMain.handle('hermes:skillMarket:installGithub', async (_event, rawRepo: unknown, rawSubdir: unknown) => {
    const repo = String(rawRepo || '')
      .trim()
      .replace(/^(https?:\/\/github\.com\/)?/, '')
      .replace(/\.git$/, '')

    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
      throw new Error(`无效的仓库标识: ${repo}(格式: owner/repo)`)
    }

    const subdir = String(rawSubdir || '')
      .trim()
      .replace(/^\/+/, '')

    const url = `https://codeload.github.com/${repo}/zip/refs/heads/main`
    rememberLog(`[skill-market] GitHub install: ${repo}${subdir ? ' /' + subdir : ''}`)

    // 1) 下载 zipball(main分支;404时退master)
    const tmpDir = path.join(app.getPath('temp'), 'qiji-skills')
    fs.mkdirSync(tmpDir, { recursive: true })
    const zipPath = path.join(tmpDir, 'gh-' + Date.now() + '.zip')
    await doGetZip(url, zipPath, {}, 5)

    // 2) 解压(zipball根目录是 repo-branch/)
    const extractDir = path.join(app.getPath('temp'), 'qiji-gh-skill-' + Date.now())
    fs.mkdirSync(extractDir, { recursive: true })
    extractZip(zipPath, extractDir)

    // 3) 递归扫描全部 SKILL.md(真实仓库结构五花八门:
    //    anthropics: skills/<name>/SKILL.md; vercel: skill-data/*/SKILL.md;
    //    单技能仓库: 根/SKILL.md。subdir 优先,否则全仓库扫描)
    const zipRoot = fs.readdirSync(extractDir).filter(f => !f.startsWith('.'))[0]

    if (!zipRoot) {
      throw new Error('压缩包为空')
    }
    const rootDir = path.join(extractDir, zipRoot)

    let skillDirs: string[]

    if (subdir) {
      const target = path.join(rootDir, subdir)
      skillDirs = fs.existsSync(path.join(target, 'SKILL.md')) ? [target] : findSkillDirs(rootDir, 0)
    } else {
      skillDirs = findSkillDirs(rootDir, 0)
    }

    if (skillDirs.length === 0) {
      throw new Error('仓库里没有 SKILL.md——不是标准 Agent Skills 仓库')
    }

    // 4) 逐个安装(多技能仓库=批量装,如 anthropics/skills 一次20个)
    const skillsRoot = path.join(hermesHome, 'skills')
    fs.mkdirSync(path.join(skillsRoot, 'market'), { recursive: true })
    const installedNames: string[] = []

    for (const dir of skillDirs) {
      let skillName = path.basename(dir)

      try {
        const md = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8')
        const m = md.match(/^name:\s*([A-Za-z0-9][A-Za-z0-9-_]*)/m)

        if (m) {
          skillName = m[1]
        }
      } catch {
        /* 用目录名 */
      }

      if (!/^[a-z0-9][a-z0-9-_]*$/i.test(skillName)) {
        continue
      }

      const destDir = path.join(skillsRoot, 'market', skillName.toLowerCase())
      fs.rmSync(destDir, { recursive: true, force: true })
      fs.cpSync(dir, destDir, { recursive: true })
      installedNames.push(skillName.toLowerCase())
    }

    fs.rmSync(extractDir, { recursive: true, force: true })

    try {
      fs.unlinkSync(zipPath)
    } catch {
      /* best effort */
    }

    if (installedNames.length === 0) {
      throw new Error('未找到合法技能(SKILL.md 的 name 均无效)')
    }
    rememberLog(`[skill-market] GitHub skills installed: ${installedNames.join(', ')} from ${repo}`)

    return { ok: true, name: installedNames[0], allNames: installedNames, source: `github:${repo}` }
  })

  ipcMain.handle('hermes:skillMarket:install', async (_event, rawUrl: unknown, rawName: unknown, rawToken: unknown) => {
    const url = String(rawUrl || '').trim()
    const name = String(rawName || '').trim()

    if (!/^https?:\/\//i.test(url)) {
      throw new Error('无效的下载地址')
    }

    if (!/^[a-z0-9][a-z0-9-_]*$/i.test(name)) {
      throw new Error('无效的技能标识')
    }

    // 下载到临时目录（带 Authorization 头——下载接口需登录态）
    const tmpDir = path.join(app.getPath('temp'), 'qiji-skills')
    fs.mkdirSync(tmpDir, { recursive: true })
    const srcPath = path.join(tmpDir, name + '-' + Date.now() + '.zip')
    const headers: Record<string, string> = {}

    if (rawToken) {
      headers['Authorization'] = 'Bearer ' + String(rawToken)
    }
    await doGetZip(url, srcPath, headers, 5)

    // 解压用系统自带工具：Windows 10+ 自带 tar(bsdtar 支持 zip)，macOS/Linux 自带 unzip
    // 先解到临时目录，校验 SKILL.md 后搬到 skills/market/{name}/
    const skillsRoot = path.join(hermesHome, 'skills')
    const destDir = path.join(skillsRoot, 'market', name)
    const extractDir = path.join(app.getPath('temp'), 'qiji-skill-extract-' + Date.now())
    fs.mkdirSync(extractDir, { recursive: true })
    extractZip(srcPath, extractDir)

    // 定位 SKILL.md：根级 或 一级子目录
    let srcDir: string | null = null
    const rootSkill = path.join(extractDir, 'SKILL.md')

    if (fs.existsSync(rootSkill)) {
      srcDir = extractDir
    } else {
      for (const d of fs.readdirSync(extractDir, { withFileTypes: true })) {
        if (d.isDirectory() && fs.existsSync(path.join(extractDir, d.name, 'SKILL.md'))) {
          srcDir = path.join(extractDir, d.name)

          break
        }
      }
    }

    if (!srcDir) {
      throw new Error('压缩包内缺少 SKILL.md')
    }

    // 搬运（覆盖旧版）
    fs.rmSync(destDir, { recursive: true, force: true })
    fs.mkdirSync(path.dirname(destDir), { recursive: true })
    fs.cpSync(srcDir, destDir, { recursive: true })

    // 清理
    try {
      fs.rmSync(extractDir, { recursive: true, force: true })
      fs.unlinkSync(srcPath)
    } catch {
      /* best effort */
    }

    rememberLog(`[skill-market] installed skill: ${name} -> ${destDir}`)

    return { ok: true, dir: destDir }
  })

  // qiji 0.19.7: 市场技能卸载——只删 skills/market/<name>/，name 走与 install 相同的
  // 白名单校验，防止路径注入。内置技能不在 market 目录下，天然删不到。
  ipcMain.handle('hermes:skillMarket:uninstall', async (_event, rawName: unknown) => {
    const name = String(rawName || '').trim()

    if (!/^[a-z0-9][a-z0-9-_]*$/i.test(name)) {
      throw new Error('无效的技能标识')
    }

    const destDir = path.join(hermesHome, 'skills', 'market', name)

    if (!fs.existsSync(destDir)) {
      throw new Error('该技能未安装')
    }

    fs.rmSync(destDir, { recursive: true, force: true })
    rememberLog(`[skill-market] uninstalled skill: ${name}`)

    return { ok: true }
  })
}
