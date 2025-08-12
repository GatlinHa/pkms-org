import { promises as fs } from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { exec } from 'child_process'
import yaml from 'js-yaml'
import { FileSaveResponse, ServiceError, ImageUploadResponse, RecentFile } from './types'

// 允许的图片扩展名
const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']

// 验证文件路径安全性
const validateFilePath = (filePath: string): void | never => {
  // 验证路径格式是否正确（以/docs/开头）
  if (!filePath.startsWith('/docs/')) {
    throw new Error('INVALID_PATH: 只能访问 docs 目录下的文件')
  }

  // 只允许 .md 文件
  if (!filePath.endsWith('.md')) {
    throw new Error('INVALID_EXTENSION: 只支持 Markdown 文件')
  }

  // 防止路径遍历攻击
  if (filePath.includes('..') || filePath.includes('//')) {
    throw new Error('PATH_TRAVERSAL: 检测到非法路径遍历')
  }
}

// 创建备份目录
const ensureBackupDir = async (filePath: string): Promise<string> => {
  const dirPath = path.dirname(filePath) // 获取文件的目录路径
  const backupDir = path.resolve(dirPath, 'backups') // 在同级目录下创建backups目录

  try {
    await fs.access(backupDir)
  } catch {
    await fs.mkdir(backupDir, { recursive: true })
  }
  return backupDir
}

// 保存 Markdown 文件（带版本控制）
export const saveMarkdownFile = async (filePath: string, content: string): Promise<FileSaveResponse | ServiceError> => {
  try {
    validateFilePath(filePath) // 验证路径安全性
    const absolutePath = path.resolve(process.cwd(), filePath.substring(1)) // 转换为绝对路径, substring(1)去掉filePath的第一个斜杠
    const timestamp = formatDateTime(new Date())
    console.log(`保存笔记: ${absolutePath}`)

    try {
      await fs.access(absolutePath) // 检查文件是否存在
      const originalContent = await fs.readFile(absolutePath, 'utf8')
      await fs.writeFile(absolutePath, content, 'utf8')
      const backupDir = await ensureBackupDir(absolutePath)
      const backupPath = path.resolve(backupDir, `${path.basename(filePath.replace('.md', ''))}_${timestamp}.md`)
      console.log(`备份笔记: ${backupPath}`)

      fs.writeFile(backupPath, originalContent, 'utf8')
        .then(async () => {
          // 清理旧备份，最多保留10个
          try {
            const files = await fs.readdir(backupDir)
            const backupPrefix = path.basename(filePath.replace('.md', '')) + '_'
            const backupFiles = files
              .filter((f) => f.startsWith(backupPrefix) && f.endsWith('.md'))
              .sort()
              .reverse() // 最新的在前

            if (backupFiles.length > 10) {
              const oldBackups = backupFiles.slice(10)
              await Promise.all(
                oldBackups.map((f) =>
                  fs.unlink(path.resolve(backupDir, f)).catch((e) => console.error('删除旧备份失败:', e))
                )
              )
            }
          } catch (e) {
            console.error('清理备份时出错:', e)
          }
        })
        .catch(console.error) // 创建备份（不阻塞主流程）
    } catch {
      // 这个节点下没有同名md文件，因此不用写备份文件，但是要修改sidebar-data.json文件，并且要重启一下
      const sidebarPath = path.resolve(process.cwd(), '.vitepress/theme/data/sidebar-data.json')
      const sidebarData = await fs.readFile(sidebarPath, 'utf8')
      const sidebarItems = JSON.parse(sidebarData)
      // 递归查找匹配路径的节点
      const findNode = (items: any[], remainingPaths: string[]): any => {
        const currentPath = remainingPaths[0]
        const found = items.find((item) => item.text === currentPath)
        if (found && found.items && remainingPaths.length > 1) {
          // 还要继续往下找
          return findNode(found.items, remainingPaths.slice(1))
        } else if (found && remainingPaths.length === 1) {
          // 找到了最后一个path的text
          return found
        } else {
          // 其他情况视为找不到
          return null
        }
      }
      const targetNode = findNode(Object.values(sidebarItems).flat(), filePath.replace('.md', '').split('/').slice(2))
      targetNode.link = filePath.replace('.md', '')
      await fs.writeFile(sidebarPath, JSON.stringify(sidebarItems, null, 2), 'utf8')
      await fs.writeFile(absolutePath, content, 'utf8')

      restartWeb()
    }

    return {
      success: true,
      message: '文件保存成功',
      filePath: absolutePath,
      timestamp
    }
  } catch (error) {
    const err = error as Error
    console.error('保存文件失败:', err.message)

    return {
      success: false,
      message: `保存失败: ${err.message.split(':')[1] || err.message}`
    }
  }
}

function formatDateTime(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0')

  return `${year}${month}${day}-${hours}${minutes}${seconds}.${milliseconds}`
}

function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.round(diffMs / (1000 * 60))
  const diffHours = Math.round(diffMs / (1000 * 60 * 60))
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 5) return '刚刚'
  if (diffMins < 60) return `${diffMins}分钟前`
  if (diffHours < 8) return `${diffHours}小时前`
  if (diffHours < 24) return '今天'
  if (diffDays < 2) return '昨天'
  if (diffDays < 3) return '前天'
  if (diffDays < 7) return `${diffDays}天前`

  // 超过7天显示完整时间
  return date
    .toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
    .replace(/\//g, '-')
}

// 图片上传
export const uploadImage = async (file: Express.Multer.File, mdPath: string): Promise<ImageUploadResponse> => {
  try {
    // 验证文件扩展名
    const ext = path.extname(file.originalname).toLowerCase()
    if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
      console.error('图片上传失败: 不支持的文件类型', file.originalname)
      throw new Error('只支持图片文件(png/jpg/jpeg/gif/svg/webp)')
    }

    const articleDir = path.resolve(process.cwd(), path.dirname(mdPath).substring(1))
    const assetsDir = path.join(articleDir, 'assets')

    // 创建assets目录(如果不存在)
    try {
      await fs.access(assetsDir)
    } catch {
      await fs.mkdir(assetsDir, { recursive: true })
    }

    // 生成UUID文件名
    const filename = `${uuidv4()}${ext}`
    const filePath = path.join(assetsDir, filename)

    // 保存文件
    await fs.writeFile(filePath, file.buffer)

    return {
      success: true,
      url: `./assets/${filename}`
    }
  } catch (error) {
    const err = error as Error
    console.error('图片上传失败:', err.message)
    return {
      success: false,
      message: `图片上传失败: ${err.message.split(':')[1] || err.message}`
    }
  }
}

// 打开文件
export const openFile = async (filePath: string): Promise<{ success: boolean; message: string }> => {
  try {
    const absolutePath = path.resolve(process.cwd(), filePath.substring(1)) // 转换为绝对路径
    // 根据不同平台使用不同命令
    const command = process.platform === 'win32' ? `start "" "${absolutePath}"` : `open "${absolutePath}"`
    exec(command, (error) => {
      if (error) {
        console.error('打开文件失败:', error)
        throw error
      }
    })

    return {
      success: true,
      message: '文件打开成功'
    }
  } catch (error) {
    const err = error as Error
    console.error('打开文件失败:', err.message)
    return {
      success: false,
      message: `打开文件失败: ${err.message.split(':')[1] || err.message}`
    }
  }
}

// 添加导航分类
export const addNav = async (nodeName: string): Promise<{ success: boolean; message: string }> => {
  try {
    console.log(`添加导航分类：${nodeName}`)
    const navPath = path.resolve(process.cwd(), '.vitepress/theme/data/nav-data.json')
    const sidebarPath = path.resolve(process.cwd(), '.vitepress/theme/data/sidebar-data.json')
    // 读取JSON文件
    const navData = await fs.readFile(navPath, 'utf8')
    const sidebarData = await fs.readFile(sidebarPath, 'utf8')
    const navItems = JSON.parse(navData)
    const sidebarItems = JSON.parse(sidebarData)

    // 插入新增的导航分类
    const navLink = `/docs/${nodeName}/`
    const newItem = {
      text: nodeName,
      link: navLink
    }
    navItems.splice(navItems.length - 1, 0, newItem)
    // 合并sidebarItem到sidebarItems对象
    sidebarItems[navLink] = [
      {
        text: nodeName,
        link: navLink + 'index',
        items: []
      }
    ]

    // 写回文件
    await fs.writeFile(navPath, JSON.stringify(navItems, null, 2), 'utf8')
    await fs.writeFile(sidebarPath, JSON.stringify(sidebarItems, null, 2), 'utf8')

    // 创建docs资源目录和默认的index.md
    const docsDir = path.resolve(process.cwd(), 'docs', nodeName)
    await fs.mkdir(docsDir, { recursive: true })
    await fs.writeFile(path.resolve(docsDir, 'index.md'), `# ${nodeName}`)

    restartWeb()

    return {
      success: true,
      message: '添加导航分类成功'
    }
  } catch (error) {
    const err = error as Error
    console.error('添加导航分类失败:', err.message)
    return {
      success: false,
      message: `添加导航分类失败: ${err.message.split(':')[1] || err.message}`
    }
  }
}

// 添加节点
export const addNode = async (nodeName: string, paths: string[]): Promise<{ success: boolean; message: string }> => {
  try {
    console.log(`添加节点：/docs/${paths.join('/')}/${nodeName}`)

    const sidebarPath = path.resolve(process.cwd(), '.vitepress/theme/data/sidebar-data.json')
    // 读取JSON文件
    const sidebarData = await fs.readFile(sidebarPath, 'utf8')
    const sidebarItems = JSON.parse(sidebarData)
    // 递归查找匹配路径的节点
    const findNode = (items: any[], remainingPaths: string[]): any => {
      const currentPath = remainingPaths[0]
      const found = items.find((item) => item.text === currentPath)
      if (found && found.items && remainingPaths.length > 1) {
        // 还要继续往下找
        return findNode(found.items, remainingPaths.slice(1))
      } else if (found && remainingPaths.length === 1) {
        // 找到了最后一个path的text
        return found
      } else {
        // 其他情况视为找不到
        return null
      }
    }

    // 查找并添加新节点
    const targetNode = findNode(Object.values(sidebarItems).flat(), [...paths])
    if (targetNode) {
      if (targetNode.items) {
        targetNode.items.push({ text: nodeName, items: [] })
      } else {
        targetNode.items = [{ text: nodeName, items: [] }]
      }

      // // 写回文件
      await fs.writeFile(sidebarPath, JSON.stringify(sidebarItems, null, 2), 'utf8')

      restartWeb()

      return {
        success: true,
        message: '添加节点成功'
      }
    } else {
      return {
        success: false,
        message: `添加节点失败: 找不到父节点`
      }
    }
  } catch (error) {
    const err = error as Error
    console.error('添加节点失败:', err.message)
    return {
      success: false,
      message: `添加节点失败: ${err.message.split(':')[1] || err.message}`
    }
  }
}

// 添加笔记
export const addMd = async (mdName: string, paths: string[]): Promise<{ success: boolean; message: string }> => {
  try {
    console.log(`添加笔记：/docs/${paths.join('/')}/${mdName}.md`)

    const sidebarPath = path.resolve(process.cwd(), '.vitepress/theme/data/sidebar-data.json')
    // 读取JSON文件
    const sidebarData = await fs.readFile(sidebarPath, 'utf8')
    const sidebarItems = JSON.parse(sidebarData)
    // 递归查找匹配路径的节点
    const findNode = (items: any[], remainingPaths: string[]): any => {
      const currentPath = remainingPaths[0]
      const found = items.find((item) => item.text === currentPath)
      if (found && found.items && remainingPaths.length > 1) {
        // 还要继续往下找
        return findNode(found.items, remainingPaths.slice(1))
      } else if (found && remainingPaths.length === 1) {
        // 找到了最后一个path的text
        return found
      } else {
        // 其他情况视为找不到
        return null
      }
    }

    // 查找并添加新笔记
    const targetNode = findNode(Object.values(sidebarItems).flat(), [...paths])
    const nodePath = `docs/${paths.join('/')}`
    const link = `/docs/${paths.join('/')}/${mdName}`
    if (targetNode) {
      if (targetNode.items) {
        targetNode.items.push({ text: mdName, link: link })
      } else {
        targetNode.items = [{ text: mdName, link: link }]
      }

      // // 写回文件
      await fs.writeFile(sidebarPath, JSON.stringify(sidebarItems, null, 2), 'utf8')

      // 创建nodeDir资源目录和md文件
      const nodeDir = path.resolve(process.cwd(), nodePath)
      try {
        await fs.access(nodeDir)
      } catch {
        await fs.mkdir(nodeDir, { recursive: true })
      }
      await fs.writeFile(path.resolve(nodeDir, `${mdName}.md`), `# ${mdName}`)

      restartWeb()

      return {
        success: true,
        message: '添加笔记成功'
      }
    } else {
      return {
        success: false,
        message: `添加笔记失败: 找不到父节点`
      }
    }
  } catch (error) {
    const err = error as Error
    console.error('添加笔记失败:', err.message)
    return {
      success: false,
      message: `添加笔记失败: ${err.message.split(':')[1] || err.message}`
    }
  }
}

// 删除节点
export const delNode = async (paths: string[]): Promise<{ success: boolean; message: string }> => {
  try {
    const sidebarPath = path.resolve(process.cwd(), '.vitepress/theme/data/sidebar-data.json')
    // 读取JSON文件
    const sidebarData = await fs.readFile(sidebarPath, 'utf8')
    const sidebarItems = JSON.parse(sidebarData)
    // 递归查找匹配路径的节点
    const findNode = (items: any[], remainingPaths: string[]): any => {
      const currentPath = remainingPaths[0]
      const found = items.find((item) => item.text === currentPath)
      if (found && found.items && remainingPaths.length > 1) {
        // 还要继续往下找
        return findNode(found.items, remainingPaths.slice(1))
      } else if (found && remainingPaths.length === 1) {
        // 找到了最后一个path的text
        return found
      } else {
        // 其他情况视为找不到
        return null
      }
    }

    // 查找并添加新笔记
    const targetNode = findNode(Object.values(sidebarItems).flat(), [...paths])

    if (!targetNode) {
      return {
        success: false,
        message: `删除失败: 找不到目标节点`
      }
    }

    const nodePath = `docs/${paths.join('/')}`
    // 如果nodedir存在，则删除nodedir
    const nodeDir = path.resolve(process.cwd(), nodePath)
    console.log(`删除节点: ${nodeDir}`)
    await fs.rm(nodeDir, { recursive: true, force: true })

    if (paths.length === 1) {
      // 删除导航分类的数据
      const navPath = path.resolve(process.cwd(), '.vitepress/theme/data/nav-data.json')
      const navData = await fs.readFile(navPath, 'utf8')
      const navItems = JSON.parse(navData) as any[]
      const newNavItems = navItems.filter((item) => item.text !== paths[0])
      await fs.writeFile(navPath, JSON.stringify(newNavItems, null, 2), 'utf8') // 写回文件

      // 删除sidebar-data.json中的数据
      delete sidebarItems[`/docs/${paths[0]}/`]
      await fs.writeFile(sidebarPath, JSON.stringify(sidebarItems, null, 2), 'utf8')
    } else if (paths.length > 1) {
      if (targetNode.link) {
        // 如果节点下有同名md，则删除
        const mdAbsolutePath = `${nodeDir}.md`
        console.log(`删除节点同名笔记: ${mdAbsolutePath}`)
        await fs.rm(mdAbsolutePath, { force: true })
      }

      // 找到父节点，从父节点的items干掉目标节点
      const parentNode = findNode(Object.values(sidebarItems).flat(), [...paths.slice(0, -1)])
      parentNode.items = parentNode.items.filter((item: any) => item.text != paths[paths.length - 1])
      await fs.writeFile(sidebarPath, JSON.stringify(sidebarItems, null, 2), 'utf8')
    }

    restartWeb()

    return {
      success: true,
      message: '删除成功'
    }
  } catch (error) {
    const err = error as Error
    console.error('删除失败:', err.message)
    return {
      success: false,
      message: `删除失败: ${err.message.split(':')[1] || err.message}`
    }
  }
}

/**
 * 更新首页features部分为最近修改的文件
 */
export const updateHomePageFeatures = async (): Promise<void> => {
  try {
    const indexPath = path.resolve(process.cwd(), 'index.md')
    const content = await fs.readFile(indexPath, 'utf8')

    // 分割YAML和内容
    const yamlEnd = content.indexOf('---', 3)
    const frontMatter = content.slice(3, yamlEnd).trim()
    // 获取YAML之后的内容，跳过可能的多余换行
    const restContent = content.slice(yamlEnd + 3).replace(/^[\r\n]+/, '')

    // 解析YAML
    const data = yaml.load(frontMatter) as any

    // 获取最近修改的文件
    const recentFiles = await getRecentModify()

    // 更新features
    data.features = recentFiles.map((file) => ({
      title: file.title,
      details: `最后修改: ${file.mtimeStr}`,
      link: file.path
    }))

    // 生成新的YAML
    const newYaml = yaml.dump(data)

    // 写回文件 (确保内容格式正确)
    await fs.writeFile(indexPath, `---\n${newYaml}\n---\n${restContent}`, { encoding: 'utf8', flag: 'w' })
  } catch (error) {
    console.error('更新首页features失败:', error)
    throw error
  }
}

const getRecentModify = async (): Promise<RecentFile[]> => {
  const docsDir = path.resolve(process.cwd(), 'docs')

  // 递归获取所有文件
  const getAllFiles = async (dir: string): Promise<string[]> => {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const files = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          // 跳过backups目录
          if (entry.name === 'backups') return []
          return getAllFiles(fullPath)
        } else {
          return [fullPath]
        }
      })
    )
    return files.flat()
  }

  const allFiles = await getAllFiles(docsDir)

  // 过滤并获取文件状态
  const mdFiles = allFiles.filter((file) => file.endsWith('.md'))
  const filesWithStats = await Promise.all(
    mdFiles.map(async (file) => {
      const stats = await fs.stat(file)
      return {
        path: '/' + path.relative(process.cwd(), file).replace(/\\/g, '/').replace('.md', ''),
        title: path
          .relative(process.cwd() + '/docs', file)
          .replace(/\\/g, ' > ')
          .replace('.md', ''),
        mtime: stats.mtimeMs,
        mtimeStr: formatRelativeTime(stats.mtime)
      }
    })
  )

  // 按修改时间排序并取前10个
  const result = filesWithStats.sort((a, b) => b.mtime - a.mtime).slice(0, 15)
  console.log(result)
  return result
}

/**
 * 重启前端开发服务器
 */
function restartWeb() {
  const killCommand =
    process.platform === 'win32'
      ? 'for /f "tokens=5" %a in (\'netstat -ano ^| findstr :4865\') do (taskkill /F /PID %a && exit 0)'
      : 'pkill -f "vitepress dev"' // 其他操作系统没测过

  setTimeout(() => {
    exec(killCommand, { cwd: process.cwd() }, (killError) => {
      if (killError) {
        console.log('没有运行的Vitepress进程需要停止')
      }

      // 启动新进程
      exec('pnpm docs:dev', { cwd: process.cwd() }, (startError) => {
        if (startError) {
          console.error('重启前端失败:', startError) // 这里有报错，但不影响重启
        } else {
          console.log('前端已重启')
        }
      })
    })
  }, 300)
}
