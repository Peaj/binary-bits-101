import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/binary-bits-101/",
  server: {
    port: 4000,
  },
});
