import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 서버 없이 브라우저 저장소(IndexedDB)만 쓰는 정적 웹. base "./" 라 아무 폴더에 올려도 열린다.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
