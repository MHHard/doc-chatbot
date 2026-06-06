export type ParseStatus = 'deferred' | 'pending' | 'ready' | 'failed'

export interface FileInfo {
  id: string
  name: string
  originalName: string
  size: number
  mimeType: string
  uploadedAt: string
  parseStatus: ParseStatus
  parseError: string | null
  parseWarning: string | null
  contentChars?: number
}

// Local-only upload task (not persisted to backend)
export interface UploadTask {
  localId: string           // temp id before server response
  file: File | null         // original File object for retry
  status: 'uploading' | 'upload_failed'
  errorMsg: string
  name: string
  size: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  // Assistant message metadata (populated at send time)
  meta?: {
    fileNames: string[]   // names of files included as context
    fileCount: number
  }
}
