import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Dois projetos, por um motivo concreto.
 *
 * **unidade** — não toca banco nenhum. Roda em paralelo, em qualquer máquina,
 * sem Docker. É o que se pode rodar na máquina de 8GB.
 *
 * **integracao** — fala com o Supabase de verdade, porque permissão e RLS são
 * *dado*: contra um dublê, o teste provaria o dublê. Roda em série
 * (`fileParallelism: false`) porque todos compartilham um banco só e alguns
 * mexem em estado de persona — dar escopo ao RH/DP para testar segregação,
 * por exemplo. Em paralelo, um arquivo enxerga o fixture do outro no meio do
 * caminho, e a suíte fica intermitente sem que nada esteja errado no código.
 *
 * O alvo é o Supabase LOCAL, preparado por `scripts/testes.mjs`. Ver a seção
 * "Testes" do CLAUDE.md.
 */

const alias = {
  // `server-only` lança fora da condição react-server, e o Vitest não a usa.
  // O módulo é só um marcador para o bundler: neutralizá-lo aqui não afasta o
  // teste do código de produção. Caminho absoluto porque o exports do pacote
  // não publica ./empty.js.
  "server-only": fileURLToPath(
    new URL("node_modules/server-only/empty.js", import.meta.url),
  ),
};

// `tests/rls/` (F2.3) fica fora de `src/` por não testar um módulo: testa o
// banco, persona por persona. Mesmo projeto, mesmas regras de série.
const INTEGRACAO = ["src/**/*.integracao.test.{ts,tsx}", "tests/**/*.integracao.test.ts"];

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: { tsconfigPaths: true, alias },
        test: {
          name: "unidade",
          environment: "node",
          globals: false,
          include: ["src/**/*.{test,spec}.{ts,tsx}"],
          exclude: ["**/node_modules/**", ...INTEGRACAO],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
      {
        plugins: [react()],
        resolve: { tsconfigPaths: true, alias },
        test: {
          name: "integracao",
          environment: "node",
          globals: false,
          include: INTEGRACAO,
          setupFiles: ["./vitest.setup.ts"],
          // Um banco só: arquivos de integração não se atropelam.
          fileParallelism: false,
        },
      },
    ],
  },
});
