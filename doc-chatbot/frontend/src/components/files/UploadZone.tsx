import { useCallback, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Loader2 } from 'lucide-react'
import { useFileStore } from '../../store/fileStore'

const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
}

const MAX_SIZE = 50 * 1024 * 1024

interface Props {
  onUploadStart?: () => void
}

export function UploadZone({ onUploadStart }: Props) {
  const { uploadFile, uploadTasks } = useFileStore()
  const isUploading = uploadTasks.some(t => t.status === 'uploading')
  const flashRef = useRef<HTMLDivElement>(null)

  const processFiles = useCallback(async (files: File[]) => {
    onUploadStart?.()
    for (const file of files) {
      await uploadFile(file)
    }
  }, [uploadFile, onUploadStart])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: processFiles,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_SIZE,
    multiple: true,
    noClick: false,
    onDropRejected: (rejections) => {
      // Let the store handle errors through upload
      for (const rej of rejections) {
        const file = rej.file
        const err = rej.errors[0]
        const msg = err.code === 'file-too-large' ? '文件超过 50MB 限制' : '不支持此文件格式'
        const { addUploadTask } = useFileStore.getState()
        const localId = `local_${Date.now()}_${Math.random()}`
        addUploadTask({ localId, file, status: 'upload_failed', errorMsg: msg, name: file.name, size: file.size })
      }
    },
  })

  // Paste handler - mounted on window, so it fires globally
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      // If paste came from the chat textarea, ChatInput handles it with auto-select
      if (e.target instanceof HTMLTextAreaElement) return
      const items = e.clipboardData?.items
      if (!items) return
      const files: File[] = []
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          const f = item.getAsFile()
          if (f) files.push(f)
        }
      }
      if (files.length > 0) {
        // Flash the upload zone
        flashRef.current?.classList.add('drag-active-flash')
        setTimeout(() => flashRef.current?.classList.remove('drag-active-flash'), 400)
        processFiles(files)
      }
    }
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [processFiles])

  return (
    <div className="mx-3 mt-1 mb-2" ref={flashRef}>
      <div
        {...getRootProps()}
        className="rounded-xl text-center cursor-pointer transition-all duration-150 select-none py-3.5 px-3"
        style={{
          border: `2px dashed ${isDragActive ? 'var(--accent)' : 'var(--border-default)'}`,
          background: isDragActive ? 'var(--accent-subtle)' : 'transparent',
          borderRadius: 10,
        }}
      >
        <input {...getInputProps()} />

        {isUploading ? (
          <>
            <div className="flex justify-center mb-1">
              <Loader2 size={18} color="var(--accent)" className="spin" />
            </div>
            <div style={{ fontSize: 12, color: 'var(--accent)' }}>上传中...</div>
          </>
        ) : (
          <>
            <div className="flex justify-center mb-1" style={{ color: isDragActive ? 'var(--accent-hover)' : 'var(--text-muted)' }}>
              <Upload size={18} strokeWidth={1.8} />
            </div>
            <div style={{ fontSize: 12, color: isDragActive ? 'var(--accent-hover)' : 'var(--text-muted)' }}>
              {isDragActive ? '松开上传' : '拖拽或点击上传'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--border-default)', marginTop: 2 }}>
              PDF · DOCX · 图片
            </div>
          </>
        )}
      </div>
    </div>
  )
}
