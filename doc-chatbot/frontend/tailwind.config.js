/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-base': '#0A0A0A',
        'bg-sidebar': '#111111',
        'bg-surface': '#1A1A1A',
        'bg-elevated': '#222222',
        'border-subtle': '#2A2A2A',
        'border-default': '#3A3A3A',
        'text-primary': '#F5F5F5',
        'text-secondary': '#A0A0A0',
        'text-muted': '#555555',
        accent: '#2563EB',
        'accent-hover': '#3B82F6',
        'status-pending': '#F59E0B',
        'status-ready': '#10B981',
        'status-error': '#EF4444',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        spin: 'spin 1s linear infinite',
        blink: 'blink 0.8s step-end infinite',
      },
      keyframes: {
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}
