import express, { Express, Request, Response } from 'express'
import multer from 'multer'
import {
  openFile,
  saveMarkdownFile,
  uploadImage,
  addNav,
  addNode,
  addMd,
  delNode,
  updateHomePageFeatures
} from './file-service'
import { SaveRequest, FileSaveResponse, ServiceError, BaseResponse } from './types'

const app: Express = express()
const PORT = 3001

app.use(express.json())

// 文件上传配置
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB限制
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.split('.').pop()?.toLowerCase()
    if (ext && ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error('只支持图片文件(png/jpg/jpeg/gif/svg/webp)'))
    }
  },
  preservePath: true
})

// 文件保存端点
const saveHandler = async (req: Request<{}, {}, SaveRequest>, res: Response<FileSaveResponse | ServiceError>) => {
  const { filePath, content } = req.body

  if (!filePath || !content) {
    return res.status(400).json({
      code: 'MISSING_PARAMS',
      message: '缺少必要参数: filePath 和 content'
    })
  }

  try {
    const result = await saveMarkdownFile(filePath, content)
    res.json(result)
    updateHomePageFeatures()
  } catch (error) {
    const err = error as Error
    res.status(500).json({
      code: 'SERVER_ERROR',
      message: `服务器错误: ${err.message}`
    })
  }
}

// 打开文件处理函数
const openHandler = async (req: Request<{}, {}, { filePath: string }>, res: Response<BaseResponse | ServiceError>) => {
  const { filePath } = req.body

  if (!filePath) {
    return res.status(400).json({
      code: 'MISSING_PARAMS',
      message: '缺少必要参数: filePath 和 content'
    })
  }

  try {
    const result = await openFile(filePath)
    res.json(result)
  } catch (error) {
    const err = error as Error
    res.status(500).json({
      code: 'SERVER_ERROR',
      message: `服务器错误: ${err.message}`
    })
  }
}

// 添加导航分类函数
const addNavHandler = async (
  req: Request<{}, {}, { nodeName: string }>,
  res: Response<BaseResponse | ServiceError>
) => {
  const { nodeName } = req.body

  if (!nodeName) {
    return res.status(400).json({
      code: 'MISSING_PARAMS',
      message: '缺少必要参数: nodeName'
    })
  }

  try {
    const result = await addNav(nodeName)
    res.json(result)
  } catch (error) {
    const err = error as Error
    res.status(500).json({
      code: 'SERVER_ERROR',
      message: `服务器错误: ${err.message}`
    })
  }
}

// 添加节点函数
const addNodeHandler = async (
  req: Request<{}, {}, { nodeName: string; paths: string[] }>,
  res: Response<BaseResponse | ServiceError>
) => {
  const { nodeName, paths } = req.body

  if (!nodeName || !paths) {
    return res.status(400).json({
      code: 'MISSING_PARAMS',
      message: '缺少必要参数: nodeName, paths'
    })
  }

  try {
    const result = await addNode(nodeName, paths)
    res.json(result)
  } catch (error) {
    const err = error as Error
    res.status(500).json({
      code: 'SERVER_ERROR',
      message: `服务器错误: ${err.message}`
    })
  }
}

// 删除节点函数
const delNodeHandler = async (
  req: Request<{}, {}, { paths: string[] }>,
  res: Response<BaseResponse | ServiceError>
) => {
  const { paths } = req.body

  if (!paths) {
    return res.status(400).json({
      code: 'MISSING_PARAMS',
      message: '缺少必要参数: paths'
    })
  }

  try {
    const result = await delNode(paths)
    res.json(result)
  } catch (error) {
    const err = error as Error
    res.status(500).json({
      code: 'SERVER_ERROR',
      message: `服务器错误: ${err.message}`
    })
  }
}

// 添加笔记函数
const addMdHandler = async (
  req: Request<{}, {}, { mdName: string; paths: string[] }>,
  res: Response<BaseResponse | ServiceError>
) => {
  const { mdName, paths } = req.body

  if (!mdName || !paths) {
    return res.status(400).json({
      code: 'MISSING_PARAMS',
      message: '缺少必要参数: mdName, paths'
    })
  }

  try {
    const result = await addMd(mdName, paths)
    res.json(result)
  } catch (error) {
    const err = error as Error
    res.status(500).json({
      code: 'SERVER_ERROR',
      message: `服务器错误: ${err.message}`
    })
  }
}

// 文件保存端点
app.post('/api/save-md', saveHandler as express.RequestHandler)

// 添加导航分类端点
app.post('/api/add-nav', addNavHandler as express.RequestHandler)

// 添加节点端点
app.post('/api/add-node', addNodeHandler as express.RequestHandler)

// 删除节点端点
app.post('/api/del-node', delNodeHandler as express.RequestHandler)

// 添加笔记端点
app.post('/api/add-md', addMdHandler as express.RequestHandler)

// 图片上传端点
app.post('/api/upload/img', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({
      code: 'NO_FILE',
      message: '未上传文件'
    })
    return
  }

  try {
    const mdPath = req.body.mdPath as string
    const result = await uploadImage(req.file, mdPath)
    res.json(result)
  } catch (error) {
    const err = error as Error
    res.status(500).json({
      code: 'UPLOAD_ERROR',
      message: err.message
    })
  }
})

// 打开文件端点
app.post('/api/open-md', openHandler as express.RequestHandler)

// 健康检查端点
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 启动服务
app.listen(PORT, () => {
  console.log(`🌐 文件服务运行在 http://localhost:${PORT}`)
  updateHomePageFeatures()
})
