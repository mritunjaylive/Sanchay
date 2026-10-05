/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // CSS variable-driven tokens — actual values set in CSS
        surface: 'hsl(var(--color-surface) / <alpha-value>)',
        'surface-elevated': 'hsl(var(--color-surface-elevated) / <alpha-value>)',
        'surface-overlay': 'hsl(var(--color-surface-overlay) / <alpha-value>)',
        text: 'hsl(var(--color-text) / <alpha-value>)',
        'text-muted': 'hsl(var(--color-text-muted) / <alpha-value>)',
        'text-subtle': 'hsl(var(--color-text-subtle) / <alpha-value>)',
        border: 'hsl(var(--color-border) / <alpha-value>)',
        'border-subtle': 'hsl(var(--color-border-subtle) / <alpha-value>)',
        primary: 'hsl(var(--color-primary) / <alpha-value>)',
        'primary-foreground': 'hsl(var(--color-primary-foreground) / <alpha-value>)',
        accent: 'hsl(var(--color-accent) / <alpha-value>)',
        'accent-foreground': 'hsl(var(--color-primary-foreground) / <alpha-value>)',
        gold: 'hsl(var(--color-gold) / <alpha-value>)',
        'gold-foreground': 'hsl(var(--color-gold-foreground) / <alpha-value>)',
        success: 'hsl(var(--color-success) / <alpha-value>)',
        warning: 'hsl(var(--color-warning) / <alpha-value>)',
        danger: 'hsl(var(--color-danger) / <alpha-value>)',
        'danger-foreground': 'hsl(var(--color-danger-foreground) / <alpha-value>)',
        income: 'hsl(var(--color-income) / <alpha-value>)',
        expense: 'hsl(var(--color-expense) / <alpha-value>)',
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      },
      backdropBlur: {
        xs: '2px',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Noto Sans Devanagari',
          'sans-serif',
        ],
        cinzel: ['Cinzel', 'Khand', 'Georgia', 'Times New Roman', 'serif'],
        khand: ['Khand', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xs: '0.25rem',
        sm: '0.375rem',
        md: '0.5rem',
        lg: '0.75rem',
        xl: '1rem',
        '2xl': '1.25rem',
        '3xl': '1.5rem',
      },
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-top': 'env(safe-area-inset-top)',
      },
      minHeight: {
        touch: '44px',
      },
      minWidth: {
        touch: '44px',
      },
      animation: {
        'fade-in': 'fadeIn 150ms cubic-bezier(0.22, 1, 0.36, 1)',
        'fade-out': 'fadeOut 150ms cubic-bezier(0.22, 1, 0.36, 1)',
        'slide-up': 'slideUp 200ms cubic-bezier(0.22, 1, 0.36, 1)',
        'slide-down': 'slideDown 200ms cubic-bezier(0.22, 1, 0.36, 1)',
        'scale-in': 'scaleIn 150ms cubic-bezier(0.22, 1, 0.36, 1)',
        'sheet-up': 'sheetUp 250ms cubic-bezier(0.22, 1, 0.36, 1)',
        shimmer: 'shimmer 2s infinite linear',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        sheetUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
    },
  },
  plugins: [
    // Built-in animation utility classes (animate-in, fade-in, zoom-in-95, slide-in-from-bottom)
    function ({ addUtilities }) {
      addUtilities({
        '.animate-in': {
          'animation-duration': '150ms',
          'animation-timing-function': 'cubic-bezier(0.22, 1, 0.36, 1)',
          'animation-fill-mode': 'both',
        },
        '.animate-out': {
          'animation-duration': '150ms',
          'animation-timing-function': 'cubic-bezier(0.22, 1, 0.36, 1)',
          'animation-fill-mode': 'both',
        },
        '.fade-in': {
          animation: 'fadeIn 150ms cubic-bezier(0.22, 1, 0.36, 1)',
        },
        '.fade-out': {
          animation: 'fadeOut 150ms cubic-bezier(0.22, 1, 0.36, 1)',
        },
        '.zoom-in-95': {
          animation: 'scaleIn 150ms cubic-bezier(0.22, 1, 0.36, 1)',
        },
        '.slide-in-from-bottom': {
          animation: 'sheetUp 250ms cubic-bezier(0.22, 1, 0.36, 1)',
        },
        '.slide-in-from-top': {
          animation: 'slideDown 200ms cubic-bezier(0.22, 1, 0.36, 1)',
        },
        '.no-scrollbar': {
          '-ms-overflow-style': 'none',
          'scrollbar-width': 'none',
          '&::-webkit-scrollbar': {
            display: 'none',
          },
        },
      })
    },
  ],
}
