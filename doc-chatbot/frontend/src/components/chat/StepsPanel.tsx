import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

interface StepsPanelProps {
  fileNames: string[]
  fileCount: number
  collapsed: boolean
}

const STEP_DELAYS = [600, 700, 600] // ms each step shows before advancing

function buildLabels(fileCount: number, fileNames: string[]): string[] {
  if (fileCount === 0) return ['理解问题', '生成回答']
  const namesLabel = fileNames.length <= 2
    ? fileNames.join('、')
    : `${fileNames.slice(0, 2).join('、')} 等 ${fileNames.length} 个文件`
  return [`读取 ${namesLabel}`, '分析文档', '生成回答']
}

export function StepsPanel({ fileNames, fileCount, collapsed }: StepsPanelProps) {
  const labels = buildLabels(fileCount, fileNames)
  const [idx, setIdx] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (collapsed) return
    timerRef.current = setTimeout(() => setIdx(i => (i + 1) % labels.length), STEP_DELAYS[idx % STEP_DELAYS.length] ?? 800)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [idx, collapsed, labels.length])

  return (
    <div
      style={{
        overflow: 'hidden',
        maxHeight: collapsed ? 0 : 40,
        opacity: collapsed ? 0 : 1,
        marginBottom: collapsed ? 0 : 4,
        transition: 'max-height 180ms ease, opacity 180ms ease, margin-bottom 180ms ease',
      }}
    >
      <div className="flex items-center gap-1.5" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
        <Loader2 size={13} className="spin" />
        <span>{labels[idx]}...</span>
      </div>
    </div>
  )
}
