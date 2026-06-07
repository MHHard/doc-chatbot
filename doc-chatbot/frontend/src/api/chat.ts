import type { ChatMessage } from '../types'
import { getSessionId } from '../utils/session'

export async function streamChat(
  message: string,
  fileIds: string[],
  history: ChatMessage[],
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void
) {
  const state = { streamId: '', seq: 0, done: false }
  const historyPayload = history
    .filter(m => !m.isStreaming)
    .map(m => ({ role: m.role, content: m.content }))

  try {
    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Id': getSessionId() },
      body: JSON.stringify({ message, fileIds, history: historyPayload }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      onError(data.error || '请求失败')
      return
    }

    await readStream(res, state, onChunk)
    if (state.done) {
      onDone()
      return
    }
    if (state.streamId) {
      await resumeStream(state, onChunk)
      onDone()
      return
    }
    onError('连接中断，请重试')
  } catch (e: unknown) {
    if (state.streamId && !state.done) {
      try {
        await resumeStream(state, onChunk)
        onDone()
        return
      } catch (resumeError: unknown) {
        onError(resumeError instanceof Error ? resumeError.message : '连接中断，自动续传失败')
        return
      }
    }
    onError(e instanceof Error ? e.message : '网络错误')
  }
}

interface StreamState {
  streamId: string
  seq: number
  done: boolean
}

async function resumeStream(
  state: StreamState,
  onChunk: (text: string) => void
) {
  const maxAttempts = 12
  const replay = createSmoothReplay(onChunk)
  for (let attempt = 0; attempt < maxAttempts && !state.done; attempt++) {
    await waitForNetwork(attempt)
    try {
      const res = await fetch(`/api/chat/stream/${state.streamId}?from=${state.seq}`, {
        headers: { 'X-Session-Id': getSessionId() },
      })
      if (!res.ok) throw new Error('续传失败')
      await readStream(res, state, replay.push)
    } catch (err) {
      if (attempt === maxAttempts - 1) throw err
    }
  }
  await replay.drain()
  if (!state.done) {
    throw new Error('连接中断，自动续传失败')
  }
}

async function waitForNetwork(attempt: number) {
  if (attempt > 0) {
    await new Promise(resolve => setTimeout(resolve, Math.min(1200 * attempt, 5000)))
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    await new Promise<void>((resolve) => {
      const finish = () => {
        window.clearTimeout(timer)
        window.removeEventListener('online', handleOnline)
        resolve()
      }
      const handleOnline = () => {
        finish()
      }
      const timer = window.setTimeout(finish, 30000)
      window.addEventListener('online', handleOnline)
    })
  }
}

function createSmoothReplay(onChunk: (text: string) => void) {
  let queue = Promise.resolve()

  const push = (text: string) => {
    queue = queue.then(() => replayText(text, onChunk))
  }

  return {
    push,
    drain: () => queue,
  }
}

async function replayText(text: string, onChunk: (text: string) => void) {
  const runes = Array.from(text)
  let i = 0
  while (i < runes.length) {
    const remaining = runes.length - i
    const size = remaining > 80 ? 6 : remaining > 24 ? 4 : 2
    onChunk(runes.slice(i, i + size).join(''))
    i += size
    await new Promise(resolve => setTimeout(resolve, 18))
  }
}

async function readStream(
  res: Response,
  state: StreamState,
  onChunk: (text: string) => void
) {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') {
        state.done = true
        return
      }
      try {
        const parsed = JSON.parse(data)
        if (parsed.streamId) state.streamId = parsed.streamId
        if (typeof parsed.seq === 'number') state.seq = Math.max(state.seq, parsed.seq)
        if (parsed.content) onChunk(parsed.content)
      } catch {
        // ignore malformed SSE payloads
      }
    }
  }
}
