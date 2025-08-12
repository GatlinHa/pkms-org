<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useData } from 'vitepress'
import { MdEditor, config } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import type { SidebarItem } from './types'
import type { TreeInstance } from 'element-plus'
import { inject } from 'vue'
import { Plus, Minus } from '@element-plus/icons-vue'

// 在后端保存文件的时候，如果内容没有更改则不保存

const { theme, isDark } = useData()
const markdownText = ref('')
const originalText = ref('') // 存储原始内容用于比较
const selectedMdFile = ref('')

const autoSaveIntervalTime = 30000 // 自动保存间隔时间
const autoSaveIntervalRef = ref<NodeJS.Timeout | null>(null) // 自动保存定时器引用
const isAutoSave = ref(true) // 是否启用自动保存
const isSaving = ref(false) // 是否正在保存
const lastSaveTime = ref<Date | null>(null) // 最后保存时间， 将来在home显示最近修改文章有用

const treeRef = ref<TreeInstance>()
const treeProps = {
  id: 'id',
  children: 'items',
  label: 'text'
}

config({
  markdownItConfig: (mdit, _options) => {
    mdit.renderer.rules.image = (tokens: any, idx: any, _options: any, _env: any, _self: any) => {
      let token = tokens[idx]
      const url = token.attrs[0][1] // 获取图片链接
      if (url.startsWith('http://') || url.startsWith('https://')) {
        // 如果是外部链接
        return `<img src="${url}" alt="${token.content}" />`
      } else if (url.startsWith('./')) {
        // 如果是以./开头的相对路径
        const imageDir = selectedMdFile.value.substring(0, selectedMdFile.value.lastIndexOf('/'))
        return `<img src="${imageDir + token.attrs[0][1].slice(1)}" alt="${token.content}"  />`
      } else if (url.startsWith('/')) {
        // 如果是以/开头的绝对路径
        return `<img src="${url}" alt="${token.content}" />`
      } else {
        return `<img src="" alt="图片显示错误" />`
      }
    }
  }
})

// 在treeData中递归查找匹配id的节点
const findTreeNodeById = (nodes: SidebarItem[], id: string): SidebarItem | null => {
  for (const node of nodes) {
    if (node.id === id) {
      return node
    }

    if (node.items) {
      const found = findTreeNodeById(node.items, id)
      if (found) return found
    }
  }
  return null
}

// 设置自动保存定时器
onMounted(() => {
  autoSaveIntervalRef.value = setInterval(onSave, autoSaveIntervalTime)
  const routePath = inject('routePath', ref({ current: '', previous: '' }))

  // 页面重载后继续定位到之前的id节点
  const urlParams = new URLSearchParams(window.location.search)
  const idParam = urlParams.get('id') ? decodeURI(urlParams.get('id')!) : null
  if (idParam) {
    const find = findTreeNodeById(treeData.value, idParam)
    if (find) {
      treeRef.value?.setCurrentKey(idParam, true)
      if (find.link) {
        selectedMdFile.value = `${find.link}.md`
        loadMdContent()
      }
    }
  } else if (routePath.value.previous && routePath.value.previous !== '/') {
    // 从笔记页面调过来，不携带id参数，分析routePath的上一个页面
    const decodePrevious = decodeURI(routePath.value.previous)
    let currentNodeId
    if (decodePrevious.endsWith('/')) {
      selectedMdFile.value = decodePrevious + 'index.md'
      currentNodeId = decodePrevious.slice(6, -1) // 去掉/docs/和最后的/
    } else {
      selectedMdFile.value = decodePrevious.replace(/\.html$/, '.md')
      currentNodeId = decodePrevious.slice(6, -5) // 去掉/docs/ + .html
    }

    treeRef.value?.setCurrentKey(currentNodeId, true)
    loadMdContent()
  }
})

// 清理定时器
onBeforeUnmount(() => {
  autoSaveIntervalRef.value && clearInterval(autoSaveIntervalRef.value)
})

const sidebar = computed(() => {
  return theme.value.sidebar || []
})

const curentTreeNode = computed(() => {
  return treeRef.value?.getCurrentNode()
})

// 递归为每个节点添加paths
const addPathsAndId = (nodes: SidebarItem[], paths: string[]): SidebarItem[] => {
  return nodes.map((node) => {
    const newNode = { ...node }
    newNode.paths = [...paths, newNode.text]
    newNode.id = newNode.paths.join('/')
    if (newNode.items) {
      newNode.items = addPathsAndId(newNode.items, newNode.paths)
    }
    return newNode
  })
}

const treeData = computed((): SidebarItem[] => {
  const data: SidebarItem[] = []
  for (const arr of Object.values(sidebar.value) as SidebarItem[][]) {
    arr.forEach((item) => {
      data.push(item)
    })
  }

  return addPathsAndId(data, [])
})

const mdEditorDarkMode = computed(() => {
  return isDark.value ? 'dark' : 'light'
})

const handleNodeClick = async (data: SidebarItem) => {
  if (!data.link) {
    selectedMdFile.value = ''
    markdownText.value = ''
    originalText.value = ''
  } else {
    selectedMdFile.value = data.link + '.md'
    loadMdContent()
  }
}

/**
 * 当前节点change的时候设置id，配合onMounted可以实现页面重载后继续定位到之前的id节点
 */
const handleCurrentChange = () => {
  if (curentTreeNode.value?.id) {
    const url = new URL(window.location.href)
    url.searchParams.set('id', curentTreeNode.value.id)
    window.history.replaceState({}, '', url.toString())
  }
}

const loadMdContent = () => {
  if (selectedMdFile.value) {
    fetch(selectedMdFile.value)
      .then((response) => response.text())
      .then((markdown) => {
        markdownText.value = markdown
        originalText.value = markdown
      })
  }
}

const onAddNode = () => {
  let title = '添加节点'
  if (!curentTreeNode.value) {
    title = '添加导航分类'
  }

  ElMessageBox.prompt('', title, {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    inputPattern: /^(?:[\u4e00-\u9fa5a-zA-Z0-9_\-.]|[\p{Emoji}])+$/u, // 中文，英文，数字，下划线，中划线，点号，emoji
    inputErrorMessage: '只能包含中文、英文、数字、下划线、中划线、点号或emoji表情'
  })
    .then(({ value }) => {
      let api = '/api/add-nav'
      let params = { nodeName: value, paths: [] }
      if (curentTreeNode.value) {
        api = '/api/add-node'
        params.paths = curentTreeNode.value.paths
      }

      fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      })
        .then(async (response) => {
          const j = await response.json()
          if (j.success) {
            ElMessage.success('添加成功，重载页面中......')
          } else {
            ElMessage.error(j.message ? j.message : '添加失败')
          }
        })
        .catch(() => {
          ElMessage.error('添加失败')
        })
    })
    .catch(() => {
      // do nothing
    })
}

const onDelNode = () => {
  if (!curentTreeNode.value) {
    ElMessage.warning('请先选择一个节点')
    return
  }

  let title = `删除: ${curentTreeNode.value.text}`
  let message = ''
  if (curentTreeNode.value.items && curentTreeNode.value.items.length > 0) {
    message = '⚠️该节点下存在子内容，请确认是否删除'
  }

  ElMessageBox.confirm(message, title, {
    confirmButtonText: '确认',
    cancelButtonText: '取消'
  })
    .then(() => {
      fetch('/api/del-node', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: curentTreeNode.value!.paths })
      })
        .then(async (response) => {
          const j = await response.json()
          if (j.success) {
            ElMessage.success('删除成功，重载页面中......')
          } else {
            ElMessage.error(j.message ? j.message : '删除失败')
          }
        })
        .catch(() => {
          ElMessage.error('删除失败')
        })
    })
    .catch(() => {
      // do nothing
    })
}

const onAddMd = () => {
  if (!curentTreeNode.value) {
    ElMessage.warning('请先选择一个节点')
    return
  }

  ElMessageBox.prompt('', '添加笔记', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    inputPattern: /^(?:[\u4e00-\u9fa5a-zA-Z0-9_\-.]|[\p{Emoji}])+$/u, // 中文，英文，数字，下划线，中划线，点号，emoji
    inputErrorMessage: '只能包含中文、英文、数字、下划线、中划线、点号或emoji表情'
  })
    .then(({ value }) => {
      const params = {
        mdName: value,
        paths: curentTreeNode.value!.paths
      }
      fetch('/api/add-md', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      })
        .then(async (response) => {
          const j = await response.json()
          if (j.success) {
            ElMessage.success('添加成功，重载页面中......')
          } else {
            ElMessage.error(j.message ? j.message : '添加失败')
          }
        })
        .catch(() => {
          ElMessage.error('添加失败')
        })
    })
    .catch(() => {
      // do nothing
    })
}

const onOpenExternally = async () => {
  if (!selectedMdFile.value) {
    ElMessage.warning('请先选择一个笔记')
    return
  }

  fetch('/api/open-md', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filePath: selectedMdFile.value
    })
  })
    .then(async (response) => {
      const j = await response.json()
      if (j.success) {
        isAutoSave.value = false //外部打开后，自动保存要关闭，避免相互覆盖
        onChangeAutoSave()
        ElMessage.success('即将打开文件，请稍候...')
      } else {
        ElMessage.error('无法在外部编辑器中打开MD文件')
      }
    })
    .catch(() => {
      ElMessage.error('无法在外部编辑器中打开MD文件')
    })
}

// 保存文件到原路径
const onSave = async () => {
  // 检查内容是否有修改
  if (markdownText.value === originalText.value) {
    return
  }

  try {
    isSaving.value = true
    const response = await fetch('/api/save-md', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePath: selectedMdFile.value || `/docs/${curentTreeNode.value!.id}.md`,
        content: markdownText.value
      })
    })

    if (!response.ok) {
      isSaving.value = false
      ElMessage.error('保存失败：HTTP 状态错误')
      throw new Error(`HTTP 状态错误: ${response.status}`)
    }

    const result = await response.json()
    if (result.success) {
      lastSaveTime.value = new Date()
      originalText.value = markdownText.value // 保存成功后更新原始内容
      ElMessage.success('保存成功')
    }

    isSaving.value = false
  } catch {
    isSaving.value = false
    ElMessage.error('保存失败')
  }
}

const onUploadImg = async (
  files: Array<File>,
  callback: (urls: string[] | { url: string; alt: string; title: string }[]) => void
) => {
  try {
    const urls = await Promise.all(
      files.map(async (file) => {
        const formData = new FormData()
        formData.append('file', file) // 'file'必须与upload.single('file')匹配
        formData.append('mdPath', selectedMdFile.value)

        const response = await fetch('/api/upload/img', {
          method: 'POST',
          body: formData // 不要设置Content-Type，浏览器会自动设置
        })

        const data = await response.json()
        if (!data.success) {
          return ''
        }
        return data.url
      })
    )
    callback(
      urls.map((url) => {
        return { url, alt: '图片显示错误', title: '' } // 返回符合MdEditor要求的格式
      })
    )
  } catch (error) {
    ElMessage.error(`上传图片失败: ${error}`)
    callback(files.map(() => ''))
  }
}

const onChangeAutoSave = () => {
  if (isAutoSave.value) {
    if (autoSaveIntervalRef.value) {
      clearInterval(autoSaveIntervalRef.value)
    }
    autoSaveIntervalRef.value = setInterval(onSave, autoSaveIntervalTime) // 每10秒自动保存一次
  } else {
    if (autoSaveIntervalRef.value) {
      clearInterval(autoSaveIntervalRef.value)
      autoSaveIntervalRef.value = null
    }
  }
}

const onReturnNotes = () => {
  let targetPath = '/'
  // 如果有选中的 Markdown 文件，则跳转到对应的 HTML 文件
  if (selectedMdFile.value) {
    targetPath = selectedMdFile.value.replace(/\.md$/, '.html')
  } else {
    const urlParams = new URLSearchParams(window.location.search)
    const pathParam = urlParams.get('id') ? decodeURI(urlParams.get('id')!) : null
    // 如果 URL 中有 path 参数，则跳转到对应的 HTML 文件
    if (pathParam) {
      targetPath = `/${pathParam.replace(/\.md$/, '.html')}`
    } else {
      // 否则尝试返回上一个页面
      try {
        // 检查是否有历史记录可返回
        if (window.history.length > 1) {
          window.history.back()
          return
        }
      } catch {
        // do nothing if history.back fails
      }
    }
  }
  window.location.href = targetPath
}
</script>

<template>
  <div class="editor-wrapper">
    <div class="editor-layout">
      <el-container>
        <el-aside width="240px">
          <div style="padding: 20px">
            <div class="operation" style="display: flex; justify-content: space-between; padding: 5px; gap: 5px">
              <el-button
                type="primary"
                :icon="Plus"
                :title="curentTreeNode ? '添加节点' : '添加导航分类'"
                circle
                @click="onAddNode"
              />
              <el-button class="add-md" type="primary" plain style="margin: 0; flex: 1" @click="onAddMd"
                >添加笔记</el-button
              >
              <el-button type="primary" :icon="Minus" :title="'删除节点'" circle style="margin: 0" @click="onDelNode" />
            </div>
            <el-tree
              ref="treeRef"
              style="max-width: 600px"
              :data="treeData"
              :props="treeProps"
              highlight-current
              node-key="id"
              @node-click="handleNodeClick"
              @current-change="handleCurrentChange"
            />
          </div>
        </el-aside>
        <el-container>
          <el-header>
            <div class="editor-header">
              <el-switch v-model="isAutoSave" active-text="自动保存" @change="onChangeAutoSave" />
              <div>
                <el-button type="warning" @click="onOpenExternally">外部打开</el-button>
                <el-button type="success" @click="onSave">保存</el-button>
                <el-button type="primary" @click="onReturnNotes">返回笔记</el-button>
              </div>
            </div>
          </el-header>
          <el-main v-loading="isSaving">
            <MdEditor v-model="markdownText" :theme="mdEditorDarkMode" @onSave="onSave" @onUploadImg="onUploadImg" />
          </el-main>
        </el-container>
      </el-container>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.editor-wrapper {
  width: 100%;
  display: flex;
  justify-content: center;

  .editor-layout {
    width: 1800px;

    .el-header {
      height: 48px;

      .editor-header {
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: space-between;
        align-items: end;
      }
    }
  }

  .el-tree {
    :deep(.el-tree-node) {
      margin-bottom: 4px;
    }
  }

  .md-editor {
    min-height: 960px;
  }
}
</style>
