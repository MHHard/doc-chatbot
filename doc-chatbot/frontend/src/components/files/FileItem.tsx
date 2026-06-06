import { useState, useRef } from 'react'
import {
  FileText, FileImage, CheckCircle, AlertCircle, Clock, Loader2,
  Pencil, Download, Trash2, Check, X
} from 'lucide-react'
import type { FileInfo, UploadTask } from '../../types'
import { useFileStore } from '../../store/fileStore'
import { downloadFile } from '../../api/files'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} 小时前`
  return `${Math.floor(hrs / 24)} 天前`
}

function FileIcon({ name, mimeType }: { name: string; mimeType: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf' || mimeType === 'application/pdf') {
    return <FileText size={16} style={{ color: '#EF4444' }} strokeWidth={1.8} />
  }
  if (ext === 'docx' || mimeType.includes('wordprocessingml')) {
    return <FileText size={16} style={{ color: '#3B82F6' }} strokeWidth={1.8} />
  }
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext) || mimeType.startsWith('image/')) {
    return <FileImage size={16} style={{ color: '#A855F7' }} strokeWidth={1.8} />
  }
  return <FileText size={16} style={{ color: 'var(--text-muted)' }} strokeWidth={1.8} />
}

function ParseStatusBadge({ file }: { file: FileInfo }) {
  switch (file.parseStatus) {
    case 'deferred':
      return (
        <div className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
          <Clock size={11} />
          <span style={{ fontSize: 11 }}>发送时解析</span>
        </div>
      )
    case 'pending':
      return (
        <div className="flex items-center gap-1" style={{ color: 'var(--status-pending)' }}>
          <Loader2 size={11} className="spin" />
          <span style={{ fontSize: 11 }}>解析中...</span>
        </div>
      )
    case 'ready':
      return (
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1" style={{ color: 'var(--status-ready)' }}>
            <CheckCircle size={11} />
            <span style={{ fontSize: 11 }}>已就绪</span>
          </div>
          {file.parseWarning && (
            <span style={{ fontSize: 11, color: 'var(--status-pending)' }} title={file.parseWarning}>⚠ 截断</span>
          )}
        </div>
      )
    case 'failed':
      return (
        <div className="flex items-center gap-1" style={{ color: 'var(--status-error)' }}>
          <AlertCircle size={11} />
          <span style={{ fontSize: 11 }}>解析失败</span>
        </div>
      )
  }
}

// Full file item (from server)
interface FileItemProps {
  file: FileInfo
  selected: boolean
}

export function FileItem({ file, selected }: FileItemProps) {
  const { toggleSelect, deleteFile, renameFile, reparseFile } = useFileStore()
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(file.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleRenameStart = (e: React.MouseEvent) => {
    e.stopPropagation()
    setRenameValue(file.name)
    setRenaming(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const handleRenameConfirm = async () => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== file.name) {
      await renameFile(file.id, trimmed)
    }
    setRenaming(false)
  }

  const handleRenameKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRenameConfirm()
    if (e.key === 'Escape') setRenaming(false)
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirmDelete) { setConfirmDelete(true); return }
    await deleteFile(file.id)
  }

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation()
    downloadFile(file.id, file.name)
  }

  const handleReparse = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await reparseFile(file.id)
  }

  return (
    <div
      className="group relative flex items-start gap-2 px-3 py-2.5 mx-2 rounded-xl border cursor-pointer transition-all duration-150"
      style={{
        background: selected ? 'var(--accent-subtle)' : undefined,
        borderColor: selected ? 'var(--accent-border)' : 'transparent',
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = '' }}
      onClick={() => toggleSelect(file.id)}
    >
      {/* Checkbox */}
      <div
        className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-150"
        style={{
          border: selected ? 'none' : '1.5px solid var(--border-default)',
          background: selected ? '#2563EB' : 'transparent',
        }}
      >
        {selected && <Check size={10} color="white" strokeWidth={2.5} />}
      </div>

      {/* File icon */}
      <div className="flex-shrink-0 mt-0.5">
        <FileIcon name={file.originalName} mimeType={file.mimeType} />
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        {renaming ? (
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <input
              ref={inputRef}
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKey}
              className="flex-1 min-w-0 text-xs px-1.5 py-0.5 rounded"
              style={{
                background: 'var(--bg-base)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                fontSize: 13,
              }}
            />
            <button
              onClick={handleRenameConfirm}
              className="p-0.5 rounded"
              style={{ color: 'var(--status-ready)' }}
            >
              <Check size={12} />
            </button>
            <button
              onClick={() => setRenaming(false)}
              className="p-0.5 rounded"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <div
            className="truncate"
            style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4 }}
            title={file.name}
          >
            {file.name}
          </div>
        )}

        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <ParseStatusBadge file={file} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>·</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatSize(file.size)}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatTime(file.uploadedAt)}</span>
        </div>

        {/* Error message */}
        {file.parseStatus === 'failed' && file.parseError && (
          <div style={{ fontSize: 11, color: 'var(--status-error)', marginTop: 2 }}>{file.parseError}</div>
        )}
        {file.parseStatus === 'ready' && file.parseWarning && (
          <div style={{ fontSize: 11, color: 'var(--status-pending)', marginTop: 2 }}>{file.parseWarning}</div>
        )}

        {/* Reparse button */}
        {file.parseStatus === 'failed' && (
          <button
            onClick={handleReparse}
            className="mt-1.5 px-2.5 py-1 rounded text-xs transition-colors"
            style={{
              border: '1px solid rgba(245,158,11,0.4)',
              color: 'var(--status-pending)',
              fontSize: 11,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,158,11,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            重新解析
          </button>
        )}
      </div>

      {/* Action buttons (hover) */}
      {!renaming && (
        <div
          className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 flex-shrink-0 transition-opacity duration-150"
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={handleRenameStart}
            className="w-6 h-6 flex items-center justify-center rounded-md transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
            title="重命名"
          >
            <Pencil size={11} />
          </button>
          <button
            onClick={handleDownload}
            className="w-6 h-6 flex items-center justify-center rounded-md transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
            title="下载"
          >
            <Download size={11} />
          </button>
          <button
            onClick={handleDelete}
            className="w-6 h-6 flex items-center justify-center rounded-md transition-colors"
            style={{ color: confirmDelete ? 'var(--status-error)' : 'var(--text-muted)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.15)'; (e.currentTarget as HTMLElement).style.color = 'var(--status-error)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; if (!confirmDelete) (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
            title={confirmDelete ? '确认删除' : '删除'}
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </div>
  )
}

// Upload task item (local, before server response)
interface UploadTaskItemProps {
  task: UploadTask
}

export function UploadTaskItem({ task }: UploadTaskItemProps) {
  const { retryUpload, removeUploadTask, uploadFile } = useFileStore()
  const pickRef = useRef<HTMLInputElement>(null)

  const handlePickAndRetry = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    removeUploadTask(task.localId)
    await uploadFile(file)
  }

  return (
    <div
      className="flex items-start gap-2 px-3 py-2.5 mx-2 rounded-xl border"
      style={{ borderColor: 'transparent', background: 'var(--bg-steps)' }}
    >
      <div className="w-4 h-4 rounded flex-shrink-0 mt-0.5" style={{ border: '1.5px solid var(--border-default)' }} />

      <div className="flex-shrink-0 mt-0.5">
        <FileText size={16} style={{ color: 'var(--text-muted)' }} strokeWidth={1.8} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="truncate" style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4 }}>
          {task.name}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {task.status === 'uploading' ? (
            <div className="flex items-center gap-1" style={{ color: 'var(--accent-hover)' }}>
              <Loader2 size={11} className="spin" />
              <span style={{ fontSize: 11 }}>上传中...</span>
            </div>
          ) : (
            <div className="flex items-center gap-1" style={{ color: 'var(--status-error)' }}>
              <AlertCircle size={11} />
              <span style={{ fontSize: 11 }}>上传失败</span>
            </div>
          )}
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>·</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatSize(task.size)}</span>
        </div>

        {task.status === 'upload_failed' && (
          <>
            {task.errorMsg && (
              <div style={{ fontSize: 11, color: 'var(--status-error)', marginTop: 2 }}>{task.errorMsg}</div>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              {task.file ? (
                <button
                  onClick={() => retryUpload(task.localId)}
                  className="px-2.5 py-1 rounded text-xs transition-colors"
                  style={{
                    border: '1px solid rgba(239,68,68,0.4)',
                    color: '#F87171',
                    fontSize: 11,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  重新上传
                </button>
              ) : (
                <>
                  <button
                    onClick={() => pickRef.current?.click()}
                    className="px-2.5 py-1 rounded text-xs transition-colors"
                    style={{ border: '1px solid rgba(239,68,68,0.4)', color: '#F87171', fontSize: 11 }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    选择文件重试
                  </button>
                  <input ref={pickRef} type="file" style={{ display: 'none' }} onChange={handlePickAndRetry} />
                </>
              )}
              <button
                onClick={() => removeUploadTask(task.localId)}
                className="p-0.5 rounded"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={11} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
