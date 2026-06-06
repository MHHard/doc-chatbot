import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, FileText, Loader2, Paperclip, Send, Link, X } from 'lucide-react'
import { useChatStore } from '../../store/chatStore'
import { useFileStore } from '../../store/fileStore'
import * as api from '../../api/files'

const CONTEXT_CHAR_LIMIT = 100000
const CHAR_WARN = 1000
const CHAR_ERROR = 3000

interface InputThumb {
  fileId: string
  objectUrl: string  // only set for images
  name: string
  isImage: boolean
}

export function ChatInput() {
  const [text, setText] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [deferredUploadIds, setDeferredUploadIds] = useState<string[]>([])
  const [inputThumbs, setInputThumbs] = useState<InputThumb[]>([])
  const [pasteBanner, setPasteBanner] = useState<{ text: string; charCount: number } | null>(null)
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const thumbsRef = useRef<InputThumb[]>([])
  thumbsRef.current = inputThumbs

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { sendMessage, isStreaming } = useChatStore()
  const { selectedIds, files, uploadFile } = useFileStore()

  // Clean up object URLs on unmount
  useEffect(() => () => thumbsRef.current.forEach(t => { if (t.objectUrl) URL.revokeObjectURL(t.objectUrl) }), [])

  const totalContentChars = [...selectedIds]
    .map(id => files.find(f => f.id === id))
    .filter(f => f?.parseStatus === 'ready')
    .reduce((sum, f) => sum + (f?.contentChars ?? 0), 0)
  const showContextLimitWarning = totalContentChars > CONTEXT_CHAR_LIMIT

  const selectedCount = selectedIds.size
  const charCount = text.length

  // Can send if there's text OR there are thumbnails (attached files)
  const canSend = (text.trim().length > 0 || inputThumbs.length > 0) && !isStreaming

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }, [text])

  const handleSend = async () => {
    if (!canSend) return
    const msg = text.trim()
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    // Clear thumbnails
    setInputThumbs(prev => { prev.forEach(t => { if (t.objectUrl) URL.revokeObjectURL(t.objectUrl) }); return [] })

    const toparse = deferredUploadIds.filter(id => {
      const f = files.find(f => f.id === id)
      return f?.parseStatus === 'deferred'
    })
    setDeferredUploadIds([])

    const preSend = toparse.length > 0 ? async () => {
      const { reparseFile } = useFileStore.getState()
      await Promise.all(toparse.map(id => reparseFile(id)))
      await new Promise<void>(resolve => {
        const check = () => {
          const allDone = toparse.every(id => {
            const f = useFileStore.getState().files.find(f => f.id === id)
            return !f || f.parseStatus !== 'pending'
          })
          if (allDone) resolve()
          else setTimeout(check, 400)
        }
        check()
      })
    } : undefined

    sendMessage(msg, Array.from(useFileStore.getState().selectedIds), preSend)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const uploadAndTrack = useCallback(async (file: File) => {
    const isImage = file.type.startsWith('image/')
    const objectUrl = isImage ? URL.createObjectURL(file) : ''
    // Optimistically add thumbnail before upload completes
    const tempId = `temp_${Date.now()}_${Math.random()}`
    if (isImage) {
      setInputThumbs(prev => [...prev, { fileId: tempId, objectUrl, name: file.name, isImage: true }])
    }
    try {
      const fileInfo = await api.uploadFile(file, true)
      const { upsertFile, toggleSelect } = useFileStore.getState()
      upsertFile(fileInfo)
      toggleSelect(fileInfo.id)
      setDeferredUploadIds(prev => [...prev, fileInfo.id])
      // Replace temp entry with real fileId
      if (isImage) {
        setInputThumbs(prev => prev.map(t => t.fileId === tempId ? { ...t, fileId: fileInfo.id } : t))
      } else {
        setInputThumbs(prev => [...prev, { fileId: fileInfo.id, objectUrl: '', name: file.name, isImage: false }])
      }
    } catch {
      if (isImage) setInputThumbs(prev => prev.filter(t => t.fileId !== tempId))
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      await uploadFile(file)
    }
  }, [uploadFile])

  const removeThumb = useCallback(async (fileId: string) => {
    setInputThumbs(prev => {
      const thumb = prev.find(t => t.fileId === fileId)
      if (thumb?.objectUrl) URL.revokeObjectURL(thumb.objectUrl)
      return prev.filter(t => t.fileId !== fileId)
    })
    setDeferredUploadIds(prev => prev.filter(id => id !== fileId))
    // Deselect + delete from backend
    if (!fileId.startsWith('temp_')) {
      await useFileStore.getState().deleteFile(fileId)
    }
  }, [])

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = Array.from(e.target.files ?? [])
    e.target.value = ''
    for (const f of fs) await uploadAndTrack(f)
  }, [uploadAndTrack])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    for (const f of Array.from(e.dataTransfer.files)) await uploadAndTrack(f)
  }, [uploadAndTrack])

  const dismissBanner = useCallback(() => {
    setPasteBanner(null)
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current)
  }, [])

  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const fileItems = Array.from(e.clipboardData.items)
      .filter(item => item.kind === 'file')
      .map(item => item.getAsFile())
      .filter(Boolean) as File[]
    if (fileItems.length > 0) {
      for (const f of fileItems) await uploadAndTrack(f)
      return
    }
    const pasted = e.clipboardData.getData('text/plain')
    if (pasted.length >= CHAR_WARN) {
      setPasteBanner({ text: pasted, charCount: pasted.length })
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current)
      bannerTimerRef.current = setTimeout(dismissBanner, 10000)
    }
  }, [dismissBanner, uploadAndTrack])

  const handleUploadAsDoc = useCallback(async () => {
    if (!pasteBanner) return
    const now = new Date()
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const file = new File([pasteBanner.text], `粘贴文本_${hhmm}.txt`, { type: 'text/plain' })
    dismissBanner()
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    await uploadAndTrack(file)
  }, [pasteBanner, dismissBanner, uploadAndTrack])

  const charColor = charCount > CHAR_ERROR ? 'var(--status-error)' : charCount > CHAR_WARN ? 'var(--status-pending)' : 'var(--text-muted)'

  return (
    <div className="flex-shrink-0 px-4 pb-2.5 pt-1">
      {/* Context bar */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full slide-down"
            style={{
              background: 'var(--accent-subtle-bg)',
              border: '1px solid var(--accent-border)',
              fontSize: 12,
              color: 'var(--accent-hover)',
            }}
          >
            <><Link size={11} /> 已选 {selectedCount} 个文件作为上下文</>

          </div>
          {showContextLimitWarning && (
            <div
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)', fontSize: 12, color: 'var(--status-pending)', cursor: 'default' }}
              title="部分文件因长度限制未被读取"
            >
              <AlertTriangle size={11} />
              <span>超出上下文限制</span>
            </div>
          )}
        </div>
      )}

      {/* Paste-large-text banner */}
      {pasteBanner && (
        <div className="flex items-start gap-2.5 px-3.5 py-2.5 mb-1.5 rounded-xl slide-down"
          style={{ background: 'var(--accent-subtle-bg)', border: '1px solid var(--accent-border)' }}>
          <FileText size={15} style={{ color: 'var(--accent-hover)', flexShrink: 0, marginTop: 1 }} strokeWidth={1.8} />
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4 }}>
              检测到大段文本（{pasteBanner.charCount.toLocaleString()} 字）
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>作为文档上传，可让 AI 更好地分析</div>
            <div className="flex items-center gap-2 mt-2">
              <button onClick={handleUploadAsDoc} className="px-2.5 py-1 rounded-md transition-colors"
                style={{ fontSize: 12, background: 'var(--accent)', color: '#fff' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                上传为文档
              </button>
              <button onClick={dismissBanner} className="px-2.5 py-1 rounded-md transition-colors"
                style={{ fontSize: 12, color: 'var(--text-muted)', border: '1px solid var(--border-default)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                保留为文字
              </button>
            </div>
          </div>
          <button onClick={dismissBanner} className="flex-shrink-0 p-0.5 rounded"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
            <X size={13} />
          </button>
        </div>
      )}

      {/* Input box */}
      <div
        className="rounded-2xl transition-all duration-150 relative"
        style={{
          background: 'var(--bg-surface)',
          border: `1px solid ${isDragOver ? 'var(--accent)' : 'var(--border-subtle)'}`,
        }}
        onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        {isDragOver && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl pointer-events-none"
            style={{ background: 'var(--accent-subtle-bg)', color: 'var(--accent-hover)', fontSize: 13 }}>
            松开上传文件
          </div>
        )}

        {/* Thumbnails row */}
        {inputThumbs.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-2.5">
            {inputThumbs.map(thumb => (
              <div key={thumb.fileId} className="relative group flex-shrink-0">
                {thumb.isImage ? (
                  <img
                    src={thumb.objectUrl}
                    alt={thumb.name}
                    style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border-subtle)', display: 'block' }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-1"
                    style={{ width: 56, height: 56, borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
                    <FileText size={18} style={{ color: 'var(--text-muted)' }} strokeWidth={1.5} />
                    <span className="truncate px-1" style={{ fontSize: 9, color: 'var(--text-muted)', maxWidth: 52 }}>
                      {thumb.name.split('.').pop()?.toUpperCase()}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => removeThumb(thumb.fileId)}
                  className="absolute flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{
                    top: -5, right: -5, width: 18, height: 18, borderRadius: '50%',
                    background: 'var(--bg-base)', border: '1.5px solid var(--border-default)',
                    color: 'var(--text-secondary)', cursor: 'pointer',
                  }}
                >
                  <X size={10} strokeWidth={2.5} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Controls row */}
        <div className="flex items-end gap-2 px-2.5 py-2">
          {/* Attachment button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
            title="上传文件"
          >
            <Paperclip size={16} strokeWidth={1.8} />
          </button>
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,.webp"
            style={{ display: 'none' }} onChange={handleFileInput} />

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKey}
            onPaste={handlePaste}
            placeholder="发送消息... (Shift+Enter 换行)"
            rows={1}
            disabled={isStreaming}
            className="flex-1 resize-none outline-none bg-transparent text-sm leading-relaxed py-1"
            style={{ color: 'var(--text-primary)', minHeight: 22, maxHeight: 160, fontSize: 14 }}
          />

          {/* Char count */}
          {charCount > CHAR_WARN && (
            <span className="flex-shrink-0 self-end pb-1" style={{ color: charColor, fontSize: 11 }}>
              {charCount}
            </span>
          )}

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 transition-all duration-150"
            style={{ background: canSend ? '#2563EB' : 'var(--bg-elevated)', cursor: canSend ? 'pointer' : 'not-allowed' }}
            onMouseEnter={e => { if (canSend) (e.currentTarget as HTMLElement).style.background = '#3B82F6' }}
            onMouseLeave={e => { if (canSend) (e.currentTarget as HTMLElement).style.background = '#2563EB' }}
          >
            {isStreaming
              ? <Loader2 size={14} color="var(--text-muted)" className="spin" />
              : <Send size={14} color={canSend ? 'white' : 'var(--text-muted)'} strokeWidth={2.2} />
            }
          </button>
        </div>
      </div>

      {/* Char warning text */}
      {charCount > CHAR_WARN && (
        <div className="mt-1 px-1" style={{ fontSize: 11, color: charColor }}>
          {charCount > CHAR_ERROR ? '超出建议长度，可能影响回复质量' : '内容较长，建议上传为文档'}
        </div>
      )}

      <div className="text-center mt-1" style={{ fontSize: 12, color: 'var(--disclaimer)' }}>
        AI 可能犯错，请核实重要信息
      </div>
    </div>
  )
}
