import { existsSync } from "node:fs";

/**
 * Carrega .env.local antes dos testes.
 *
 * Parte da suíte fala com o Supabase de verdade (permissão é dado no banco:
 * testar contra um dublê seria testar o dublê). Sem as chaves, esses testes
 * falham alto — nunca são pulados em silêncio.
 */
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}
