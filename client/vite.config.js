import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "^/api(?:/|\\?|$)": {
        target: process.env.DEVMIND_DEV_API_ORIGIN || "http://127.0.0.1:8080",
        changeOrigin: true,
        configure(proxy) {
          proxy.on("proxyReq", (request) => {
            for (const header of request.getHeaderNames()) {
              if (
                header === "forwarded" ||
                header.startsWith("x-forwarded-") ||
                header === "x-real-ip" ||
                header === "x-vercel-forwarded-for"
              ) {
                request.removeHeader(header);
              }
            }
          });
        },
      },
    },
  },
});
