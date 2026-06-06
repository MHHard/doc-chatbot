import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Copy, Download, User, Bot, Check } from 'lucide-react'
import type { ChatMessage } from '../../types'
import { StepsPanel } from './StepsPanel'
import { ExportModal } from './ExportModal'

interface Props {
  message: ChatMessage
}

export function MessageBubble({ message }: Props) {
  const [copied, setCopied] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const isUser = message.role === 'user'

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isStreaming = message.isStreaming ?? false
  const hasContent = message.content.length > 0
  // Show steps panel while streaming but no content yet (covers both fast and slow pre-processing)
  const showSteps = message.meta !== undefined
  // Collapse as soon as the first content chunk arrives
  const stepsCollapsed = hasContent

  return (
    <>
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{
          background: isUser ? '#2563EB' : 'var(--bg-surface)',
          border: isUser ? 'none' : '1px solid var(--border-subtle)',
        }}
      >
        {isUser
          ? <User size={13} color="white" strokeWidth={2} />
          : <Bot size={13} color="var(--text-secondary)" strokeWidth={2} />
        }
      </div>

      {/* Message content */}
      <div
        className={`group flex flex-col gap-0 ${isUser ? 'items-end' : 'items-start'}`}
        style={{ maxWidth: isUser ? '75%' : '85%' }}
      >
        {/* Steps panel (AI only, while streaming with no content yet) */}
        {!isUser && showSteps && (
          <StepsPanel
            fileNames={message.meta!.fileNames}
            fileCount={message.meta!.fileCount}
            collapsed={stepsCollapsed}
          />
        )}

        {/* Bubble — only shown once content arrives, or always for user */}
        {(isUser || hasContent) && (
          <div
            className="px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed"
            style={{
              background: isUser ? '#2563EB' : 'var(--bg-surface)',
              color: isUser ? '#fff' : 'var(--text-primary)',
              borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              border: isUser ? 'none' : '1px solid var(--border-subtle)',
            }}
          >
            {isUser ? (
              <span style={{ whiteSpace: 'pre-wrap' }}>{message.content}</span>
            ) : (
              <>
                <div className="md">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight]}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
                {isStreaming && (
                  <span className="streaming-cursor" />
                )}
              </>
            )}
          </div>
        )}

        {/* Actions (AI only, after streaming done) */}
        {!isUser && !isStreaming && hasContent && (
          <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors"
              style={{ color: 'var(--text-muted)', fontSize: 12 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? '已复制' : '复制'}
            </button>
            <button
              onClick={() => setExportOpen(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors"
              style={{ color: 'var(--text-muted)', fontSize: 12 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
            >
              <Download size={11} />
              导出
            </button>
          </div>
        )}
      </div>
    </div>

    {exportOpen && (
      <ExportModal message={message} onClose={() => setExportOpen(false)} />
    )}
    </>
  )
}
