import { useEffect } from 'react'
import { CheckCircle, X } from 'lucide-react'
import { useToastStore } from '../../store/toastStore'

const DURATION = 4000

function ToastItem({ id, message }: { id: string; message: string }) {
  const removeToast = useToastStore(s => s.removeToast)

  useEffect(() => {
    const t = setTimeout(() => removeToast(id), DURATION)
    return () => clearTimeout(t)
  }, [id, removeToast])

  return (
    <div
      className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl shadow-lg slide-down"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        fontSize: 13,
        color: 'var(--text-primary)',
        minWidth: 220,
        maxWidth: 320,
      }}
    >
      <CheckCircle size={14} style={{ color: 'var(--status-ready)', flexShrink: 0 }} />
      <span className="flex-1">{message}</span>
      <button
        onClick={() => removeToast(id)}
        className="flex-shrink-0 rounded p-0.5 transition-colors"
        style={{ color: 'var(--text-muted)' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
      >
        <X size={12} />
      </button>
    </div>
  )
}

export function ToastContainer() {
  const toasts = useToastStore(s => s.toasts)
  if (toasts.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 28,
        right: 24,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: 'flex-end',
      }}
    >
      {toasts.map(t => (
        <ToastItem key={t.id} id={t.id} message={t.message} />
      ))}
    </div>
  )
}
