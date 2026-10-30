import { defineConfig } from "vite";
import { airportMiddleware } from "./server/airport.js";
export default defineConfig({
  plugins: [
    {
      name: "incheon-public-data",
      configureServer(server) {
        server.middlewares.use(airportMiddleware);
      },
      configurePreviewServer(server) {
        server.middlewares.use(airportMiddleware);
      },
    },
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) =>
          id.includes("/node_modules/three/")
            ? id.includes("/build/three.core.js")
              ? "three-core"
              : "three-engine"
            : undefined,
      },
    },
  },
});
