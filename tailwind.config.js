import plugin from 'tailwindcss/plugin';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          green: '#22C55E',
          'green-hover': '#16a34a',
          'green-light': '#4ade80',
          'green-dark': '#15803d',
        },
        // Theme-aware tokens (PRD design system). They follow the Day / Night
        // variables in index.css, so one class works in both modes.
        app: 'var(--bg-primary)',
        surface: 'var(--surface-main)',
        'surface-2': 'var(--surface-secondary)',
        ink: 'var(--text-primary)',
        mute: 'var(--text-secondary)',
        line: 'var(--glass-border)',
        accent: 'var(--accent-text)',
        dark: {
          bg: '#080B10',
          surface: '#0B0F14',
          surface2: '#111827',
          card: '#1F2937',
          border: '#374151',
          text: '#FFFFFF',
          muted: '#9CA3AF',
        },
        light: {
          bg: '#F3F4F6',
          surface: '#FFFFFF',
          card: '#FFFFFF',
          border: '#E5E7EB',
          text: '#111827',
          muted: '#6B7280',
        },
        // Named "status" so it does not shadow Tailwind's own red/blue/amber.
        status: { red: '#EF4444', blue: '#3B82F6', amber: '#F59E0B' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        heading: ['Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Inter', 'system-ui', 'monospace'],
        numbers: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [
    // The pages use "light:" next to "dark:". Tailwind has no such variant, so
    // those classes were silently ignored and Day mode looked broken.
    plugin(({ addVariant }) => addVariant('light', 'html.light &')),
  ],
};
