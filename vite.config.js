import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// Vite 플러그인: 빌드/개발 시작 시 node_modules에서 ffmpeg-core 파일을 public으로 복사
function copyFfmpegCore() {
  const files = ['ffmpeg-core.js', 'ffmpeg-core.wasm']
  const src = 'node_modules/@ffmpeg/core/dist/esm'
  return {
    name: 'copy-ffmpeg-core',
    buildStart() {
      files.forEach(f => {
        const from = resolve(src, f)
        const to = resolve('public', f)
        if (existsSync(from)) copyFileSync(from, to)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), copyFfmpegCore()],
  server: {
    port: 8888,
    strictPort: true,
    open: true,
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
})
