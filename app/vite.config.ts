import path from "path"
import fs from "node:fs"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const packageVersion = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "./package.json"), "utf-8")
).version
const publicVersion = packageVersion.split(".").slice(0, 2).join(".")

// https://vite.dev/config/
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(publicVersion),
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
