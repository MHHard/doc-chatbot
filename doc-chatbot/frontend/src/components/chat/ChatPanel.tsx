import { Trash2 } from 'lucide-react'
import { useChatStore } from '../../store/chatStore'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'

export function ChatPanel() {
  const { messages, clearMessages, isStreaming } = useChatStore()
  const hasMessages = messages.length > 0

  return (
    <div className="flex flex-col h-full min-w-0">
      {/* Toolbar */}
      <div
        className="flex-shrink-0"
        style={{ minHeight: 36, paddingTop: 8 }}
      >
        <div className="w-full max-w-[800px] mx-auto px-4 flex justify-end">
          {hasMessages && (
            <button
              onClick={clearMessages}
              disabled={isStreaming}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors"
              style={{ fontSize: 12, color: 'var(--text-muted)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
            >
              <Trash2 size={13} />
              清空对话
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <MessageList />

      {/* Input */}
      <ChatInput />
    </div>
  )
}
