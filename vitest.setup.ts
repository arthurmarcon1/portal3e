import { existsSync } from "node:fs";

/**
 * Resolve o alvo dos testes de integração.
 *
 * Ordem de precedência:
 *
 * 1. **Ambiente já definido por `scripts/testes.mjs`** (`npm test`). É o
 *    caminho normal: aponta para o Supabase local, recém-resetado.
 * 2. **`.env.test.local`**, se existir. Escape hatch deliberado, fora do git,
 *    para apontar a suíte a um projeto remoto quando não há Docker na
 *    máquina. Quem usa isso assume que está escrevendo num banco que não será
 *    resetado — e que os fixtures precisam limpar o que criaram.
 * 3. **Nada.** Os testes de integração falham alto no próprio `beforeAll`,
 *    com a mensagem dizendo o que fazer. Nunca são pulados em silêncio.
 *
 * `.env.local` NÃO é lido aqui de propósito: ele aponta para o projeto na
 * nuvem, que é ambiente de demonstração com seed estável. Teste automatizado
 * não escreve nele.
 */
if (process.env.PORTAL3E_ALVO_DE_TESTE !== "local" && existsSync(".env.test.local")) {
  process.loadEnvFile(".env.test.local");
  process.env.PORTAL3E_ALVO_DE_TESTE ??= "override";
}
