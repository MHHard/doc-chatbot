import { create } from 'zustand'

interface ThemeStore {
  isDark: boolean
  toggle: () => void
}

// Default to light mode
document.documentElement.classList.add('light')

export const useThemeStore = create<ThemeStore>((set, get) => ({
  isDark: false,
  toggle: () => {
    const next = !get().isDark
    set({ isDark: next })
    document.documentElement.classList.toggle('light', !next)
  },
}))
