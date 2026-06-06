import { create } from 'zustand'
import type { FileInfo, UploadTask } from '../types'
import * as api from '../api/files'

interface FileStore {
  files: FileInfo[]
  uploadTasks: UploadTask[]
  selectedIds: Set<string>
  pollingIds: Set<string>

  // File list actions
  setFiles: (files: FileInfo[]) => void
  upsertFile: (file: FileInfo) => void
  removeFile: (id: string) => void

  // Upload task actions
  addUploadTask: (task: UploadTask) => void
  updateUploadTask: (localId: string, patch: Partial<UploadTask>) => void
  removeUploadTask: (localId: string) => void

  // Selection
  toggleSelect: (id: string) => void
  selectAll: () => void
  deselectAll: () => void
  isAllSelected: () => boolean

  // Polling
  startPolling: (id: string) => void
  stopPolling: (id: string) => void

  // Operations
  fetchFiles: () => Promise<void>
  uploadFile: (file: File) => Promise<void>
  retryUpload: (localId: string) => Promise<void>
  deleteFile: (id: string) => Promise<void>
  renameFile: (id: string, name: string) => Promise<void>
  reparseFile: (id: string) => Promise<void>
}

// Module-level polling timers
const pollingTimers = new Map<string, ReturnType<typeof setInterval>>()

export const useFileStore = create<FileStore>((set, get) => ({
  files: [],
  uploadTasks: [],
  selectedIds: new Set(),
  pollingIds: new Set(),

  setFiles: (files) => set({ files }),

  upsertFile: (file) => set(state => {
    const idx = state.files.findIndex(f => f.id === file.id)
    if (idx >= 0) {
      const updated = [...state.files]
      updated[idx] = file
      return { files: updated }
    }
    return { files: [file, ...state.files] }
  }),

  removeFile: (id) => set(state => ({
    files: state.files.filter(f => f.id !== id),
    selectedIds: new Set([...state.selectedIds].filter(sid => sid !== id)),
  })),

  addUploadTask: (task) => set(state => ({
    uploadTasks: [task, ...state.uploadTasks],
  })),

  updateUploadTask: (localId, patch) => set(state => ({
    uploadTasks: state.uploadTasks.map(t =>
      t.localId === localId ? { ...t, ...patch } : t
    ),
  })),

  removeUploadTask: (localId) => set(state => ({
    uploadTasks: state.uploadTasks.filter(t => t.localId !== localId),
  })),

  toggleSelect: (id) => set(state => {
    const next = new Set(state.selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return { selectedIds: next }
  }),

  selectAll: () => set(state => ({
    selectedIds: new Set(state.files.map(f => f.id)),
  })),

  deselectAll: () => set({ selectedIds: new Set() }),

  isAllSelected: () => {
    const { files, selectedIds } = get()
    return files.length > 0 && files.every(f => selectedIds.has(f.id))
  },

  startPolling: (id) => {
    if (pollingTimers.has(id)) return
    const timer = setInterval(async () => {
      try {
        const file = await api.getFileStatus(id)
        get().upsertFile(file)
        if (file.parseStatus !== 'pending') {
          get().stopPolling(id)
        }
      } catch {
        get().stopPolling(id)
      }
    }, 1500)
    pollingTimers.set(id, timer)
    set(state => ({ pollingIds: new Set([...state.pollingIds, id]) }))
  },

  stopPolling: (id) => {
    const timer = pollingTimers.get(id)
    if (timer) { clearInterval(timer); pollingTimers.delete(id) }
    set(state => {
      const next = new Set(state.pollingIds)
      next.delete(id)
      return { pollingIds: next }
    })
  },

  fetchFiles: async () => {
    try {
      const files = await api.listFiles()
      set({ files })
      // Start polling for any pending files
      for (const f of files) {
        if (f.parseStatus === 'pending') {
          get().startPolling(f.id)
        }
      }
    } catch {
      // Silently ignore on startup
    }
  },

  uploadFile: async (file: File) => {
    const localId = `local_${Date.now()}_${Math.random()}`
    get().addUploadTask({
      localId,
      file,
      status: 'uploading',
      errorMsg: '',
      name: file.name,
      size: file.size,
    })

    try {
      const fileInfo = await api.uploadFile(file)
      get().removeUploadTask(localId)
      get().upsertFile(fileInfo)
      if (fileInfo.parseStatus === 'pending') {
        get().startPolling(fileInfo.id)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '上传失败'
      get().updateUploadTask(localId, { status: 'upload_failed', errorMsg: msg })
    }
  },

  retryUpload: async (localId: string) => {
    const task = get().uploadTasks.find(t => t.localId === localId)
    if (!task || !task.file) return
    get().updateUploadTask(localId, { status: 'uploading', errorMsg: '' })
    try {
      const fileInfo = await api.uploadFile(task.file)
      get().removeUploadTask(localId)
      get().upsertFile(fileInfo)
      if (fileInfo.parseStatus === 'pending') {
        get().startPolling(fileInfo.id)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '上传失败'
      get().updateUploadTask(localId, { status: 'upload_failed', errorMsg: msg })
    }
  },

  deleteFile: async (id: string) => {
    await api.deleteFile(id)
    get().removeFile(id)
    get().stopPolling(id)
  },

  renameFile: async (id: string, name: string) => {
    const file = await api.renameFile(id, name)
    get().upsertFile(file)
  },

  reparseFile: async (id: string) => {
    const file = await api.reparseFile(id)
    get().upsertFile(file)
    get().startPolling(id)
  },
}))
