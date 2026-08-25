import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: ['**/._*', '**/node_modules/**'],
    env: {
      // must match the BASE / IMAGE_SERVER constants in helpers.test.js and handler.test.js
      PUBLIC_URL: 'http://test.local',
      IIIF_IMAGE_SERVER: 'http://images.test.local/'
    }
  }
})
