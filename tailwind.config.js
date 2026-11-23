import plugin from 'tailwindcss/plugin';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          green: 'oklch(0.723 0.191 149.6 / <alpha-value>)',
          'green-hover': 'oklch(0.627 0.17 149.5 / <alpha-value>)',
          'green-light': 'oklch(0.8 0.18 151 / <alpha-value>)',
          'green-dark': 'oklch(0.527 0.154 150 / <alpha-value>)',
          // The three brand colours (see BRAND.md): Logo Blue, Signal Green (above), Speed Amber.
          blue: 'oklch(0.46 0.21 263 / <alpha-value>)',
          'blue-light': 'oklch(0.72 0.15 263 / <alpha-value>)',
          amber: 'oklch(0.79 0.17 75 / <alpha-value>)',
          'amber-dark': 'oklch(0.58 0.14 68 / <alpha-value>)',
        },
        link: 'var(--link)',
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
          bg: 'oklch(0.145 0.012 262 / <alpha-value>)',
          surface: 'oklch(0.18 0.014 262 / <alpha-value>)',
          surface2: 'oklch(0.215 0.02 262 / <alpha-value>)',
          card: 'oklch(0.27 0.022 262 / <alpha-value>)',
          border: 'oklch(0.36 0.02 262 / <alpha-value>)',
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
        sans: ['ABC Diatype', 'TWK Lausanne', 'Switzer', 'Saans', 'Strichpunkt Sans', 'Arial', 'system-ui', 'sans-serif'],
        heading: ['ABC Diatype', 'TWK Lausanne', 'Switzer', 'Saans', 'Strichpunkt Sans', 'Arial', 'system-ui', 'sans-serif'],
        body: ['ABC Diatype', 'TWK Lausanne', 'Switzer', 'Saans', 'Strichpunkt Sans', 'Arial', 'system-ui', 'sans-serif'],
        mono: ['ABC Diatype', 'TWK Lausanne', 'Switzer', 'Saans', 'Strichpunkt Sans', 'Arial', 'system-ui', 'sans-serif'],
        numbers: ['ABC Diatype', 'TWK Lausanne', 'Switzer', 'Saans', 'Strichpunkt Sans', 'Arial', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [
    // The pages use "light:" next to "dark:". Tailwind has no such variant, so
    // those classes were silently ignored and Day mode looked broken.
    plugin(({ addVariant }) => addVariant('light', 'html.light &')),
  ],
};
