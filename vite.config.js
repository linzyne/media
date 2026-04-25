import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 8888, // 포트 번호를 영구 고정
    strictPort: true, // 다른 프로그램이 사용중이라도 포트를 변경하지 않고 경고
    open: true, // 실행 시 자동으로 브라우저 탭 열기
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
})
