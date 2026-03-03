/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        brand: {
          DEFAULT: '#f97316',
          light:   '#fb923c',
          dark:    '#ea580c',
          subtle:  '#431407',
          muted:   'rgba(249,115,22,0.12)',
        },
        surface: {
          base:    '#0f172a',
          raised:  '#1e293b',
          overlay: '#243044',
          input:   '#334155',
          border:  '#334155',
          subtle:  '#475569',
        },
        text: {
          primary:   '#f1f5f9',
          secondary: '#94a3b8',
          muted:     '#64748b',
          disabled:  '#475569',
          inverse:   '#0f172a',
        },
        status: {
          success: '#4ade80',
          'success-bg': '#052e16',
          'success-border': '#166534',
          warning: '#fbbf24',
          'warning-bg': '#1c1002',
          'warning-border': '#92400e',
          error:   '#f87171',
          'error-bg': '#1c0a0a',
          'error-border': '#991b1b',
          info:    '#60a5fa',
          'info-bg': '#0a1628',
          'info-border': '#1e3a5f',
        },
        region: {
          east:    '#f87171',
          west:    '#60a5fa',
          south:   '#4ade80',
          midwest: '#fbbf24',
        },
      },
      boxShadow: {
        sm:           '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
        md:           '0 4px 12px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.3)',
        lg:           '0 10px 30px rgba(0,0,0,0.6), 0 4px 8px rgba(0,0,0,0.3)',
        'glow-brand': '0 0 20px rgba(249,115,22,0.35)',
        'glow-sm':    '0 0 8px rgba(249,115,22,0.2)',
        'inner-sm':   'inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      backgroundImage: {
        'card-shine':       'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 60%)',
        'brand-gradient':   'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
        'surface-gradient': 'linear-gradient(180deg, #1e293b 0%, #172033 100%)',
      },
      borderRadius: {
        xl:  '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      animation: {
        'fade-in':  'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
        skeleton:   'skeleton 1.5s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        skeleton: {
          '0%, 100%': { opacity: '0.4' },
          '50%':      { opacity: '0.8' },
        },
      },
    },
  },
  plugins: [],
};
