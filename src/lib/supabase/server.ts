import { cookies } from "next/headers";

import { createServerClient } from "@supabase/ssr";

import { chaveAnon, urlSupabase } from "./env";
import type { Database } from "./types";

/**
 * Cliente para Server Components, Server Actions e route handlers.
 *
 * Roda com a chave anon e a sessão do usuário vinda do cookie: RLS continua
 * valendo. Crie um por requisição — nunca guarde em módulo ou cache global,
 * senão a sessão de um usuário vaza para o próximo.
 */
export async function criarClienteServidor() {
  const cookieStore = await cookies();

  return createServerClient<Database>(urlSupabase(), chaveAnon(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesParaGravar) {
        try {
          for (const { name, value, options } of cookiesParaGravar) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component não pode gravar cookie. O middleware renova a
          // sessão, então aqui é seguro ignorar.
        }
      },
    },
  });
}
