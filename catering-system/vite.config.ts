import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // 廚房現場是用手機開的，單一 1.8MB chunk 首次載入太重。把三個大的、
        // 且更新頻率遠低於應用程式碼的相依拆出去，讓它們能被瀏覽器長期快取：
        //  - firebase  最大宗，幾乎每個 service 都靜態 import
        //  - xlsx      只有 /menu-import 的 Excel 上傳會用到
        //  - recharts  只有 Analytics 與市價走勢圖會用到
        manualChunks: {
          firebase: ['firebase/app', 'firebase/firestore', 'firebase/auth'],
          xlsx:     ['xlsx'],
          charts:   ['recharts'],
        },
      },
    },
  },
});
