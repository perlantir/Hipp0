/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./public/index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        nexus: {
          bg: {
            light: '#F7F6F2',
            dark: '#171614',
          },
          surface: {
            light: '#F9F8F5',
            dark: '#1C1B19',
          },
          'surface-alt': {
            light: '#FBFBF9',
            dark: '#201F1D',
          },
          border: {
            light: '#D4D1CA',
            dark: '#393836',
          },
          text: {
            light: '#28251D',
            dark: '#CDCCCA',
          },
          'text-muted': {
            light: '#7A7974',
            dark: '#797876',
          },
          'text-faint': {
            light: '#BAB9B4',
            dark: '#5A5957',
          },
        },
        primary: {
          DEFAULT: '#01696F',
          hover: '#0C4E54',
          light: '#4F98A3',
        },
        status: {
          active: '#01696F',
          superseded: '#D19900',
          reverted: '#A13544',
          pending: '#FFC553',
        },
        urgency: {
          critical: '#A13544',
          high: '#DA7101',
          medium: '#01696F',
          low: '#7A7974',
        },
        chart: {
          teal: '#20808D',
          terra: '#A84B2F',
          'dark-teal': '#1B474D',
          cyan: '#BCE2E7',
          mauve: '#944454',
          gold: '#FFC553',
          olive: '#848456',
          brown: '#6E522B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'DM Sans', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease-out',
        'slide-in': 'slideIn 200ms ease-out',
        'slide-up': 'slideUp 300ms ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
    },
  },
  plugins: [],
};
