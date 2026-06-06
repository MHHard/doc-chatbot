import { useEffect, useState } from 'react'
import { Sun, Moon, Bot, PanelLeftClose, PanelLeft } from 'lucide-react'
import { FileManager } from '../files/FileManager'
import { ChatPanel } from '../chat/ChatPanel'
import { ToastContainer } from './Toast'
import { useThemeStore } from '../../store/themeStore'
import { useIsMobile } from '../../hooks/useIsMobile'

export function AppLayout() {
  const isMobile = useIsMobile()
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768)
  const { isDark, toggle } = useThemeStore()

  useEffect(() => {
    if (isMobile) setSidebarOpen(false)
  }, [isMobile])

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--bg-base)' }}>
      {/* Header */}
      <header
        className="flex items-center gap-2.5 px-4 flex-shrink-0"
        style={{
          height: 48,
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-base)',
          zIndex: 60,
        }}
      >
        <button
          onClick={() => setSidebarOpen(v => !v)}
          className="w-8 h-8 flex items-center justify-center rounded-md transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
          title={sidebarOpen ? '折叠侧栏' : '展开侧栏'}
        >
          {sidebarOpen
            ? <PanelLeftClose size={16} strokeWidth={1.8} />
            : <PanelLeft size={16} strokeWidth={1.8} />
          }
        </button>

        <div className="flex items-center gap-1.5 flex-1">
          <Bot size={16} color="#2563EB" strokeWidth={2} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>文档助手</span>
        </div>

        <button
          onClick={toggle}
          className="w-8 h-8 flex items-center justify-center rounded-md transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
          title={isDark ? '切换到亮色模式' : '切换到暗色模式'}
        >
          {isDark ? <Sun size={16} strokeWidth={1.8} /> : <Moon size={16} strokeWidth={1.8} />}
        </button>
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Mobile backdrop */}
        {isMobile && sidebarOpen && (
          <div
            className="fixed inset-0"
            style={{ background: 'rgba(0,0,0,0.45)', top: 48, zIndex: 40 }}
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className="flex-shrink-0 overflow-hidden"
          style={isMobile ? {
            position: 'fixed',
            top: 48,
            left: 0,
            bottom: 0,
            width: 272,
            zIndex: 50,
            background: 'var(--bg-sidebar)',
            borderRight: '1px solid var(--border-subtle)',
            transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 250ms ease-in-out',
          } : {
            width: sidebarOpen ? 272 : 0,
            background: 'var(--bg-sidebar)',
            borderRight: '1px solid var(--border-subtle)',
            transition: 'width 250ms ease-in-out',
          }}
        >
          <div style={{ width: 272, height: '100%' }}>
            <FileManager />
          </div>
        </aside>

        {/* Chat area */}
        <main className="flex-1 min-w-0">
          <ChatPanel />
        </main>
      </div>
      <ToastContainer />
    </div>
  )
}
