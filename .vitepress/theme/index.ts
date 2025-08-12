import DefaultTheme from 'vitepress/theme'
import type { EnhanceAppContext } from 'vitepress'
import Editor from './Editor.vue'
import { ref, watch, watchEffect } from 'vue'
import { useRoute } from 'vitepress'
import { provide } from 'vue'

// let navData = {}
// let sidebarData = {}

export default {
  extends: DefaultTheme,
  enhanceApp(ctx: EnhanceAppContext) {
    const { app } = ctx
    // 注册全局组件
    app.component('editor', Editor)
  },

  async setup() {
    // 开发模式下检查后端健康状态
    if (import.meta.env.DEV) {
      watchEffect(async () => {
        try {
          const response = await fetch('/api/health')
          if (!response.ok) {
            console.warn('⚠️ 后端服务未响应，自动保存功能可能不可用')
          }
        } catch (error) {
          console.error('❌ 无法连接到后端服务:', error)
        }
      })
    }

    const route = useRoute()
    const routePath = ref({
      current: route.path,
      previous: ''
    })
    provide('routePath', routePath)

    watch(
      () => route.path,
      (newPath, oldPath) => {
        routePath.value = {
          current: newPath,
          previous: oldPath || ''
        }
      },
      { immediate: true }
    )

    // const { theme } = useData()
    // const updateNavData = async () => {
    //   const module = await import('./data/nav-data.json?raw')
    //   const newData = JSON.parse(module.default)
    //   if (JSON.stringify(navData) !== JSON.stringify(newData)) {
    //     navData = newData
    //     theme.value.nav = newData // 这种方式没办法刷新页面上的nav数据
    //     console.log('nav 已更新')
    //   }
    // }

    // const updateSidebarData = async () => {
    //   const module = await import('./data/sidebar-data.json?raw')
    //   const newData = JSON.parse(module.default)
    //   if (JSON.stringify(sidebarData) !== JSON.stringify(newData)) {
    //     sidebarData = newData
    //     theme.value.sidebar = newData // 这种方式没办法刷新页面上的nav数据
    //     console.log('sidebar 已更新')
    //   }
    // }

    // updateNavData()
    // updateSidebarData()
  }
}
