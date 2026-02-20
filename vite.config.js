import { defineConfig } from "vite";

export default defineConfig({
  base: "/IFC_reader/",
  server: {
    port: 5173,
    open: false
  }
});
