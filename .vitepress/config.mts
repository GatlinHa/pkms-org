import { defineConfig } from 'vitepress'
import { MermaidMarkdown, MermaidPlugin } from 'vitepress-plugin-mermaid'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import path from 'path'
import fs from 'fs'

function loadData(type: string) {
  const dataPath = path.resolve(__dirname, `./theme/data/${type}-data.json`)
  try {
    if (fs.existsSync(dataPath)) {
      const read = fs.readFileSync(dataPath, 'utf-8')
      return JSON.parse(read)
    }
  } catch (error) {
    console.error('初始化数据加载失败', error)
    return {}
  }
}

export default defineConfig({
  title: '知识库',
  description: '我的个人知识库',
  head: [
    [
      'meta',
      {
        name: 'keywords',
        content: '知识库,个人知识库,技术文档'
      }
    ],
    ['link', { rel: 'icon', href: '/image/favicon.png' }]
  ],
  themeConfig: {
    nav: loadData('nav'),
    sidebar: loadData('sidebar'),
    editLink: {
      pattern: '/docs/editor',
      text: '编辑此页'
    },

    search: {
      provider: 'local',
      options: {
        miniSearch: {
          /**
           * @type {Pick<import('minisearch').Options, 'extractField' | 'tokenize' | 'processTerm'>}
           */
          options: {},
          /**
           * @type {import('minisearch').SearchOptions}
           * @default
           * { fuzzy: 0.2, prefix: true, boost: { title: 4, text: 2, titles: 1 } }
           */
          searchOptions: {
            fuzzy: 0.2,
            prefix: true,
            boost: { title: 4, text: 2, titles: 1 },
            filter: (result) => {
              return !result.id.includes('/backups/')
            }
          }
        },
        translations: {
          button: {
            buttonText: '搜索文档',
            buttonAriaLabel: '搜索文档'
          },
          modal: {
            noResultsText: '无法找到相关结果',
            resetButtonTitle: '清除查询条件',
            footer: {
              selectText: '选择',
              navigateText: '切换',
              closeText: '关闭'
            }
          }
        }
      }
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/GatlinHa/pkms' }],

    outline: {
      label: '本页导航',
      level: [2, 6]
    },

    docFooter: {
      prev: false,
      next: false
    },

    returnToTopLabel: '返回顶部',

    darkModeSwitchLabel: '主题',

    lastUpdated: { text: '上次Git提交时间' }
  },
  ignoreDeadLinks: true,

  // vitepress支持Mermaid画图
  markdown: {
    config(md) {
      md.use(MermaidMarkdown)
    }
  },
  vite: {
    plugins: [
      // @ts-ignore
      MermaidPlugin(),
      AutoImport({
        resolvers: [ElementPlusResolver()]
      }),
      Components({
        resolvers: [ElementPlusResolver()]
      })
    ],
    optimizeDeps: {
      include: ['mermaid']
    },
    ssr: {
      noExternal: ['mermaid']
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true
        }
      }
    },
    // 屏蔽告警：The legacy JS API is deprecated and will be removed in Dart Sass 2.0.0.
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler'
        }
      }
    }
  }
})
