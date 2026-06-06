import { useEffect } from 'react'
import { AppLayout } from './components/layout/AppLayout'
import { useChatStore } from './store/chatStore'
import { useFileStore } from './store/fileStore'

export default function App() {
  const sendMessage = useChatStore(s => s.sendMessage)
  const selectedIds = useFileStore(s => s.selectedIds)

  useEffect(() => {
    window.__sendMsg = (text, fileIds) => sendMessage(text, fileIds ?? Array.from(selectedIds))
  }, [sendMessage, selectedIds])

  return <AppLayout />
}
