import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChatMessage } from '../types'
import { streamChat } from '../api/chat'
import { useFileStore } from './fileStore'
import { getSessionId } from '../utils/session'

interface ChatStore {
  messages: ChatMessage[]
  isStreaming: boolean
  addMessage: (msg: ChatMessage) => void
  updateLastAssistant: (content: string) => void
  setLastAssistantDone: () => void
  clearMessages: () => void
  sendMessage: (text: string, fileIds: string[], preSend?: () => Promise<void>) => Promise<void>
}

let msgCounter = 0

declare global { interface Window { __sendMsg?: (text: string, fileIds: string[]) => void } }

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      messages: [],
      isStreaming: false,

      addMessage: (msg) => set(state => ({ messages: [...state.messages, msg] })),

      updateLastAssistant: (chunk) => set(state => {
        const msgs = [...state.messages]
        const last = msgs[msgs.length - 1]
        if (last?.role === 'assistant') {
          msgs[msgs.length - 1] = { ...last, content: last.content + chunk }
        }
        return { messages: msgs }
      }),

      setLastAssistantDone: () => set(state => {
        const msgs = [...state.messages]
        const last = msgs[msgs.length - 1]
        if (last?.role === 'assistant') {
          msgs[msgs.length - 1] = { ...last, isStreaming: false }
        }
        return { messages: msgs, isStreaming: false }
      }),

      clearMessages: () => set({ messages: [] }),

      sendMessage: async (text, fileIds, preSend?) => {
        if (get().isStreaming) return

        const { files } = useFileStore.getState()
        const selectedFiles = files.filter(f => fileIds.includes(f.id))

        const userMsg: ChatMessage = {
          id: `msg_${++msgCounter}`,
          role: 'user',
          content: text,
        }
        const assistantMsg: ChatMessage = {
          id: `msg_${++msgCounter}`,
          role: 'assistant',
          content: '',
          isStreaming: true,
          meta: {
            fileNames: selectedFiles.map(f => f.name),
            fileCount: selectedFiles.length,
          },
        }

        set(state => ({
          messages: [...state.messages, userMsg, assistantMsg],
          isStreaming: true,
        }))

        const history = get().messages.slice(0, -2)

        if (preSend) await preSend()

        await streamChat(
          text,
          fileIds,
          history,
          (chunk) => get().updateLastAssistant(chunk),
          () => get().setLastAssistantDone(),
          (err) => {
            get().updateLastAssistant(`\n\n_错误：${err}_`)
            get().setLastAssistantDone()
          }
        )
      },
    }),
    {
      name: `chat-${getSessionId()}`,
      // Only persist messages, not isStreaming
      partialize: (state) => ({ messages: state.messages }),
      onRehydrateStorage: () => (state) => {
        if (!state?.messages) return
        // Fix messages that were mid-stream when page closed
        state.messages = state.messages
          .filter(m => m.role === 'user' || m.content.length > 0)
          .map(m => m.isStreaming ? { ...m, isStreaming: false } : m)
        // Advance counter past existing IDs to avoid collisions
        msgCounter = state.messages.length * 2 + 10
      },
    }
  )
)
