import { create } from 'zustand'

interface Toast {
  id: string
  message: string
}

interface ToastStore {
  toasts: Toast[]
  addToast: (message: string) => void
  removeToast: (id: string) => void
}

let counter = 0

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (message) => {
    const id = `toast_${++counter}`
    set(state => ({ toasts: [...state.toasts, { id, message }] }))
  },
  removeToast: (id) => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),
}))
