import { useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { X, FileText, FileImage, Loader2 } from 'lucide-react'
import type { ChatMessage } from '../../types'
import { useChatStore } from '../../store/chatStore'
import { exportMarkdown, exportPdf, exportDocx } from '../../utils/export'

interface Props {
  message: ChatMessage
  onClose: () => void
}

type Range = 'single' | 'full'
type Format = 'md' | 'pdf' | 'docx'

function buildFilename(range: Range, ext: string) {
  return `${range === 'full' ? '完整对话' : 'AI回复'}_${Date.now()}.${ext}`
}

export function ExportModal({ message, onClose }: Props) {
  const [range, setRange] = useState<Range>('single')
  const [loading, setLoading] = useState<Format | null>(null)
  const messages = useChatStore(s => s.messages)
  const pdfRef = useRef<HTMLDivElement>(null)

  const getContent = () => {
    if (range === 'single') return message.content
    return messages
      .filter(m => !m.isStreaming && m.content)
      .map(m => m.role === 'user' ? `**用户：** ${m.content}` : m.content)
      .join('\n\n---\n\n')
  }

  const handle = async (fmt: Format) => {
    if (loading) return
    setLoading(fmt)
    try {
      const content = getContent()
      if (fmt === 'md') {
        exportMarkdown(content, buildFilename(range, 'md'))
        onClose()
      } else if (fmt === 'pdf') {
        if (pdfRef.current) {
          await exportPdf(pdfRef.current, buildFilename(range, 'pdf'))
        }
        onClose()
      } else {
        await exportDocx(content, buildFilename(range, 'docx'))
        onClose()
      }
    } finally {
      setLoading(null)
    }
  }

  const formats: { key: Format; label: string; sub: string; icon: React.ReactNode }[] = [
    { key: 'md',   label: 'Markdown', sub: '.md',   icon: <FileText size={20} strokeWidth={1.6} /> },
    { key: 'pdf',  label: 'PDF',      sub: '.pdf',  icon: <FileImage size={20} strokeWidth={1.6} /> },
    { key: 'docx', label: 'Word',     sub: '.docx', icon: <FileText size={20} strokeWidth={1.6} /> },
  ]

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)' }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1001,
          width: 360,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 16,
          padding: '20px 20px 16px',
          boxShadow: '0 24px 48px rgba(0,0,0,0.25)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>导出</span>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Range */}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>导出范围</div>
        <div className="flex gap-2 mb-5">
          {([['single', '仅此条消息'], ['full', '完整对话']] as [Range, string][]).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setRange(v)}
              className="flex-1 py-1.5 rounded-lg text-sm transition-all"
              style={{
                fontSize: 13,
                border: `1px solid ${range === v ? 'var(--accent)' : 'var(--border-default)'}`,
                background: range === v ? 'var(--accent-subtle-bg)' : 'transparent',
                color: range === v ? 'var(--accent-hover)' : 'var(--text-secondary)',
                fontWeight: range === v ? 500 : 400,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Format cards */}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>导出格式</div>
        <div className="flex gap-2">
          {formats.map(({ key, label, sub, icon }) => (
            <button
              key={key}
              onClick={() => handle(key)}
              disabled={loading !== null}
              className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl transition-all"
              style={{
                border: '1px solid var(--border-default)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading && loading !== key ? 0.5 : 1,
              }}
              onMouseEnter={e => { if (!loading) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent-hover)' } }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-default)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}
            >
              {loading === key
                ? <Loader2 size={20} className="spin" />
                : icon
              }
              <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Off-screen render for PDF */}
      <div
        ref={pdfRef}
        style={{
          position: 'fixed',
          left: -9999,
          top: 0,
          width: 700,
          padding: '32px 40px',
          background: '#ffffff',
          color: '#111111',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: 14,
          lineHeight: 1.7,
          zIndex: -1,
        }}
      >
        <div className="md">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {getContent()}
          </ReactMarkdown>
        </div>
      </div>
    </>
  )
}
