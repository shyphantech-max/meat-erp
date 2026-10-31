/** Bundles the Catalyst function: backend/src/catalyst.ts → backend/functions/api/index.js (CommonJS, Node 20) */
import { defineConfig } from 'vite'
import path from 'node:path'

export default defineConfig({
  publicDir: false,
  resolve: { alias: { '@': path.resolve(__dirname, '../src') } },
  build: {
    ssr: path.resolve(__dirname, 'src/catalyst.ts'),
    outDir: path.resolve(__dirname, 'functions/api'),
    emptyOutDir: false,
    target: 'node20',
    minify: false,
    rollupOptions: {
      external: ['zcatalyst-sdk-node'],
      output: { format: 'cjs', entryFileNames: 'index.js', exports: 'default' },
    },
  },
  ssr: { noExternal: true, external: ['zcatalyst-sdk-node'] },
})
