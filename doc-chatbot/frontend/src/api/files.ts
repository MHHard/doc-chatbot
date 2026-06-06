import type { FileInfo } from '../types'
import { getSessionId } from '../utils/session'

const BASE = '/api/files'

function sessionHeader(): Record<string, string> {
  return { 'X-Session-Id': getSessionId() }
}

export async function uploadFile(file: File, defer?: boolean): Promise<FileInfo> {
  const form = new FormData()
  form.append('file', file)
  const url = defer ? `${BASE}/upload?defer=true` : `${BASE}/upload`
  const res = await fetch(url, { method: 'POST', headers: sessionHeader(), body: form })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '上传失败')
  return data
}

export async function listFiles(): Promise<FileInfo[]> {
  const res = await fetch(BASE, { headers: sessionHeader() })
  if (!res.ok) throw new Error('获取文件列表失败')
  return res.json()
}

export async function getFileStatus(id: string): Promise<FileInfo> {
  const res = await fetch(`${BASE}/${id}/status`, { headers: sessionHeader() })
  if (!res.ok) throw new Error('获取状态失败')
  return res.json()
}

export async function renameFile(id: string, name: string): Promise<FileInfo> {
  const res = await fetch(`${BASE}/${id}/rename`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...sessionHeader() },
    body: JSON.stringify({ name }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '重命名失败')
  return data
}

export async function deleteFile(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE', headers: sessionHeader() })
  if (!res.ok) throw new Error('删除失败')
}

export async function downloadFile(id: string, name: string) {
  const res = await fetch(`${BASE}/${id}/download`, { headers: sessionHeader() })
  if (!res.ok) return
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export async function reparseFile(id: string): Promise<FileInfo> {
  const res = await fetch(`${BASE}/${id}/reparse`, { method: 'POST', headers: sessionHeader() })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '重新解析失败')
  return data
}
