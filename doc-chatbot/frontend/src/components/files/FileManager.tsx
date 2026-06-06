import { useEffect } from 'react'
import { FolderOpen } from 'lucide-react'
import { useFileStore } from '../../store/fileStore'
import { UploadZone } from './UploadZone'
import { FileItem, UploadTaskItem } from './FileItem'

export function FileManager() {
  const {
    files, uploadTasks, selectedIds,
    fetchFiles, selectAll, deselectAll, isAllSelected,
  } = useFileStore()

  useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

  const allSelected = isAllSelected()
  const selectedCount = selectedIds.size
  const totalFiles = files.length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center px-4 pt-3.5 pb-2.5 flex-shrink-0">
        <div className="flex items-center gap-1.5" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
          <FolderOpen size={14} strokeWidth={2} />
          文件管理
        </div>
        <span className="ml-auto" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {totalFiles > 0 ? `${totalFiles} 个文件` : ''}
        </span>
      </div>

      {/* Upload zone */}
      <UploadZone />

      {/* Select bar */}
      {(totalFiles > 0 || uploadTasks.length > 0) && (
        <div className="flex items-center justify-between px-3.5 pb-1.5 flex-shrink-0">
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {selectedCount > 0 ? `已选 ${selectedCount} 个` : '选择文件加入对话'}
          </span>
          {totalFiles > 0 && (
            <button
              onClick={allSelected ? deselectAll : selectAll}
              className="flex items-center gap-1 px-1 py-0.5 rounded transition-colors"
              style={{ fontSize: 12, color: 'var(--text-muted)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              {allSelected ? '取消全选' : '全选'}
            </button>
          )}
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto py-1">
        {/* Upload tasks first (newest at top) */}
        {uploadTasks.map(task => (
          <UploadTaskItem key={task.localId} task={task} />
        ))}

        {/* Server files */}
        {files.map(file => (
          <FileItem
            key={file.id}
            file={file}
            selected={selectedIds.has(file.id)}
          />
        ))}

        {files.length === 0 && uploadTasks.length === 0 && (
          <div
            className="text-center py-8"
            style={{ fontSize: 13, color: 'var(--border-default)' }}
          >
            暂无文件
          </div>
        )}
      </div>
    </div>
  )
}
