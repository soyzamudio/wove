import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import react from "@astrojs/react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  server: { port: 4321 },
  vite: {
    resolve: {
      alias: {
        "@theme": path.resolve(__dirname, "./src/theme/default"),
      },
    },
  },
});
