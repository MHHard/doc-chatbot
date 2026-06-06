import { useEffect, useRef, useCallback, useState } from 'react'
import { Bot } from 'lucide-react'
import { useChatStore } from '../../store/chatStore'
import { MessageBubble } from './MessageBubble'

const NEAR_BOTTOM_THRESHOLD = 80 // px — within this distance counts as "at bottom"

export function MessageList() {
  const { messages } = useChatStore()
  const listRef = useRef<HTMLDivElement>(null)
  // true = user has scrolled away from the bottom and we should not override
  const userScrolledRef = useRef(false)
  const autoScrollFrameRef = useRef<number | null>(null)
  const [showJumpToBottom, setShowJumpToBottom] = useState(false)

  const isNearBottom = useCallback(() => {
    const el = listRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_THRESHOLD
  }, [])

  const scrollToBottom = useCallback(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [])

  // Detect user-initiated scroll
  const handleScroll = useCallback(() => {
    const awayFromBottom = !isNearBottom()
    userScrolledRef.current = awayFromBottom
    setShowJumpToBottom(awayFromBottom)
  }, [isNearBottom])

  // Auto-scroll on new content — only if user hasn't scrolled away
  useEffect(() => {
    if (userScrolledRef.current) return
    if (autoScrollFrameRef.current !== null) {
      cancelAnimationFrame(autoScrollFrameRef.current)
    }
    autoScrollFrameRef.current = requestAnimationFrame(() => {
      scrollToBottom()
      autoScrollFrameRef.current = null
    })
  }, [messages, scrollToBottom])

  // When a new conversation starts (message count goes 0→1), always scroll
  const prevLengthRef = useRef(0)
  useEffect(() => {
    if (prevLengthRef.current === 0 && messages.length > 0) {
      userScrolledRef.current = false
      setShowJumpToBottom(false)
      scrollToBottom()
    }
    prevLengthRef.current = messages.length
  }, [messages.length, scrollToBottom])

  useEffect(() => {
    return () => {
      if (autoScrollFrameRef.current !== null) {
        cancelAnimationFrame(autoScrollFrameRef.current)
      }
    }
  }, [])

  const handleJumpToBottom = () => {
    userScrolledRef.current = false
    setShowJumpToBottom(false)
    scrollToBottom()
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3.5 p-10">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
        >
          <Bot size={28} color="#2563EB" strokeWidth={1.8} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>文档分析助手</div>
        <div
          className="text-center"
          style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 260, lineHeight: 1.7 }}
        >
          在左侧上传文件并勾选，然后发送消息，我将帮你分析和总结文档内容。
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-6 py-4 flex flex-col gap-5"
      >
        {messages.map(msg => (
          <div key={msg.id} className="fade-in">
            <MessageBubble message={msg} />
          </div>
        ))}
      </div>

      {showJumpToBottom && (
        <button
          onClick={handleJumpToBottom}
          className="absolute left-1/2 -translate-x-1/2 bottom-4 px-3 py-1.5 rounded-full text-xs shadow-lg transition-colors"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          }}
        >
          回到底部
        </button>
      )}
    </div>
  )
}
