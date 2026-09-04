import "server-only";

import { createClient } from "@supabase/supabase-js";

import { chaveServiceRole, urlSupabase } from "./env";

/**
 * Cliente com `service_role` — ignora RLS por completo.
 *
 * Invariante 2 do CLAUDE.md: esta chave nunca chega ao browser. O import de
 * `server-only` quebra o build se alguém puxar este módulo para um Client
 * Component; não remova.
 *
 * Use só onde a operação é legitimamente de sistema (seed, job, criação de
 * usuário, geração de URL assinada depois de a permissão já ter sido checada
 * à mão). Toda chamada precisa checar permissão antes e gravar em `auditoria`
 * depois — aqui não existe rede de proteção do banco.
 */
export function criarClienteAdmin() {
  return createClient(urlSupabase(), chaveServiceRole(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
