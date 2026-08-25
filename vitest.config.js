import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: ['**/._*', '**/node_modules/**'],
    env: {
      // must match the BASE constant in helpers.test.js and handler.test.js
      PUBLIC_URL: 'http://test.local'
    }
  }
})
