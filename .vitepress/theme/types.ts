// 共享类型定义

export interface SidebarItem {
  id?: string
  paths?: string[]
  text: string
  link?: string
  items?: SidebarItem[]
}
