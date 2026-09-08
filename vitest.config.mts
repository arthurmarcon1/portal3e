import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Resolve o alias @/* do tsconfig.json.
    tsconfigPaths: true,
    alias: {
      // `server-only` lança fora da condição react-server, e o Vitest não a
      // usa. O módulo é só um marcador para o bundler: neutralizá-lo aqui não
      // afasta o teste do código de produção. Caminho absoluto porque o
      // exports do pacote não publica ./empty.js.
      "server-only": fileURLToPath(
        new URL("node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    // Unidade roda em node. Teste de componente pede jsdom — instale
    // jsdom e troque o environment quando a primeira tela tiver teste.
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
  },
});
