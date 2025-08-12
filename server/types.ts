// 文件服务响应类型
export interface FileSaveResponse {
  success: boolean
  message: string
  filePath?: string
  timestamp?: string
}

// API 请求体类型
export interface SaveRequest {
  filePath: string
  content: string
}

// 错误处理类型
export interface ServiceError {
  code: string
  message: string
}

// 图片上传响应类型
export interface ImageUploadResponse {
  success: boolean
  url?: string // 图片相对路径(成功时返回)
  message?: string
}

// 打开文件的响应类型
export interface BaseResponse {
  success: boolean
  message?: string
}

// 最近编辑文件信息
export interface RecentFile {
  path: string
  title: string
  mtime: number
  mtimeStr: string
}
