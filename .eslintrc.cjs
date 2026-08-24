module.exports = {
  ignorePatterns: [
    'build/**',
    'dist/**'
  ],
  env: {
    browser: true,
    es2021: true
  },
  extends: [
    'standard',
    'plugin:react/recommended'
  ],
  overrides: [
    {
      env: {
        node: true
      },
      files: [
        '.eslintrc.{js,cjs}'
      ],
      parserOptions: {
        sourceType: 'script'
      }
    }
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  plugins: [
    'react'
  ],
  rules: {
    // Directus field/config names are snake_case throughout this codebase
    // (IIIF_settings columns like iiif_file, annotation_files,
    // filename_download); enforcing camelCase would fight the domain, not
    // catch real bugs.
    camelcase: 'off'
  }
}
