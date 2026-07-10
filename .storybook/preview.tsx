import type { Preview, Decorator } from '@storybook/nextjs-vite'
import '../src/app/globals.css'

// Fonts (Geist) are loaded and their CSS variables defined in
// .storybook/preview-head.html — @storybook/nextjs-vite does not process
// next/font, so we can't rely on it here.

const withTheme: Decorator = (Story, context) => {
  const theme = context.globals.theme ?? 'light'
  return (
    <div className={`${theme === 'dark' ? 'dark' : ''} antialiased`}>
      <div className="min-h-screen bg-background p-8 text-foreground">
        <Story />
      </div>
    </div>
  )
}

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      test: 'todo',
    },
  },
  globalTypes: {
    theme: {
      description: 'Light / dark theme',
      defaultValue: 'light',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'light', title: 'Light', icon: 'sun' },
          { value: 'dark', title: 'Dark', icon: 'moon' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [withTheme],
}

export default preview
