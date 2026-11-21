import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" para que funcione en GitHub Pages (subcarpeta del repo)
export default defineConfig({
  base: "./",
  plugins: [react()],
});
