/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
  	extend: {
      fontFamily: {
        inter: ['var(--font-inter)'],
        bricolage: ['var(--font-bricolage)'],
        'fraunces': ['var(--font-fraunces)'],
      },
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))'
        },
        study: {
          pane: 'hsl(var(--study-pane))',
          'pane-text': 'hsl(var(--study-pane-text))',
          'answer-bg': 'hsl(var(--study-answer-bg))',
          'answer-border': 'hsl(var(--study-answer-border))',
          correct: 'hsl(var(--study-correct))',
          'correct-bg': 'hsl(var(--study-correct-bg))',
          wrong: 'hsl(var(--study-wrong))',
          'wrong-bg': 'hsl(var(--study-wrong-bg))',
          'first-wrong': 'hsl(var(--study-first-wrong))',
          'first-wrong-bg': 'hsl(var(--study-first-wrong-bg))',
          missed: 'hsl(var(--study-missed))',
          'missed-bg': 'hsl(var(--study-missed-bg))',
          eliminated: 'hsl(var(--study-eliminated))',
          'eliminated-bg': 'hsl(var(--study-eliminated-bg))',
          'hint-bg': 'hsl(var(--study-hint-bg))',
          'hint-text': 'hsl(var(--study-hint-text))',
          'mastery-bg': 'hsl(var(--study-mastery-bg))',
          'choice-border': 'hsl(var(--study-choice-border))',
          'choice-bg': 'hsl(var(--study-choice-bg))',
          badge: 'hsl(var(--study-badge))',
          'image-bg': 'hsl(var(--study-image-bg))',
          partial: 'hsl(var(--study-partial))',
          'partial-bg': 'hsl(var(--study-partial-bg))',
          disabled: 'hsl(var(--study-disabled))',
        },
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		keyframes: {
  			'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
  			'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        'shake': { '0%, 100%': { transform: 'translateX(0)' }, '20%': { transform: 'translateX(-4px)' }, '40%': { transform: 'translateX(4px)' }, '60%': { transform: 'translateX(-3px)' }, '80%': { transform: 'translateX(3px)' } },
        'pop-in': { '0%': { transform: 'scale(0.95)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        'subtle-shake': { '0%, 100%': { transform: 'translateX(0)' }, '25%': { transform: 'translateX(-3px)' }, '75%': { transform: 'translateX(3px)' } },
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
        'shake': 'shake 0.4s ease-in-out',
        'pop-in': 'pop-in 0.15s ease-out',
        'subtle-shake': 'subtle-shake 0.6s ease-in-out',
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}
