import { defineConfig } from 'vite'

// JSX를 React 17+ 자동 런타임으로 변환합니다.
// (이 설정이 없으면 각 .jsx 파일에서 React를 import하지 않았을 때 "React is not defined" 오류가 납니다.)
export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
})
