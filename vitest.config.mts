import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Resolve o alias @/* do tsconfig.json.
    tsconfigPaths: true,
  },
  test: {
    // Unidade roda em node. Teste de componente pede jsdom — instale
    // jsdom e troque o environment quando a primeira tela tiver teste.
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    globals: false,
  },
});
