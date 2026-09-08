import { createBrowserClient } from "@supabase/ssr";

import { chaveAnon, urlSupabase } from "./env";
import type { Database } from "./types";

/**
 * Cliente para Client Components.
 *
 * Roda com a chave anon e a sessão do usuário: toda leitura passa por RLS.
 * Use só quando a tela precisa mesmo de interatividade — o padrão do projeto é
 * Server Component com o cliente de `./server`.
 */
export function criarClienteBrowser() {
  return createBrowserClient<Database>(urlSupabase(), chaveAnon());
}
