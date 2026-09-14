import { existsSync } from "node:fs";

/**
 * Resolve o alvo dos testes de integração.
 *
 * O caminho normal é `npm test`, que roda `scripts/testes.mjs`: ele decide
 * entre o Supabase local (com `db reset`) e o projeto dev na nuvem conforme
 * exista Docker, e entrega as credenciais já no ambiente. Quando isso
 * aconteceu, `PORTAL3E_ALVO_DE_TESTE` está definido e aqui não há nada a fazer.
 *
 * Este bloco cobre o outro caso: alguém rodou `npx vitest` ou
 * `npm run test:integracao` direto. Aí lemos o mesmo arquivo que o script
 * leria, para o comportamento não depender de por qual porta se entrou.
 *
 * Sem nenhuma das duas coisas, os testes de integração falham no próprio
 * `beforeAll`, com a mensagem dizendo o que fazer. Nunca são pulados em
 * silêncio: teste de RLS que não roda é pior que teste ausente, porque passa
 * a impressão de cobertura.
 */
if (!process.env.PORTAL3E_ALVO_DE_TESTE) {
  const arquivo = [".env.test.local", ".env.local"].find((f) => existsSync(f));

  if (arquivo) {
    process.loadEnvFile(arquivo);
    process.env.PORTAL3E_ALVO_DE_TESTE = "nuvem";
  }
}
