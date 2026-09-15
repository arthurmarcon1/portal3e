import "server-only";

import { createHmac } from "node:crypto";

import { chaveServiceRole } from "@/lib/supabase/env";
import { criarClienteAdmin } from "@/lib/supabase/admin";

import {
  ACOES_DE_TENTATIVA,
  avaliarBloqueio,
  inicioDaJanela,
  type SituacaoDeBloqueio,
} from "./bloqueio";

/**
 * O lado de banco do bloqueio de login. A regra está em `./bloqueio`.
 */

/**
 * Chave do identificador em `auditoria.detalhes.chave_login`.
 *
 * Por que não o CPF: `detalhes` guarda o identificador mascarado de propósito
 * (docs/03), e tentativa com CPF digitado errado é o CPF de outra pessoa.
 * Por que não um sha256 simples: CPF tem 10^9 valores e sha256 é rápido — a
 * tabela inteira se desfaz em minutos numa GPU. O HMAC com segredo do servidor
 * não se desfaz sem o segredo.
 *
 * O segredo é derivado da `service_role` em vez de uma variável nova: ela já
 * é obrigatória, já é só-servidor e já é o que dá acesso à tabela. Trocar a
 * `service_role` zera as contagens em andamento — efeito de no máximo uma
 * janela de bloqueio, aceitável para uma troca de chave.
 *
 * A chave existe para identificador SEM cadastro também. É isso que impede o
 * bloqueio de revelar quem existe: CPF inventado bloqueia igual.
 */
export function chaveDoLogin(emailDeLogin: string): string {
  const segredo = createHmac("sha256", chaveServiceRole())
    .update("portal3e:bloqueio-de-login")
    .digest();
  return createHmac("sha256", segredo).update(emailDeLogin.trim().toLowerCase()).digest("hex");
}

/**
 * Situação de bloqueio do identificador, lida da `auditoria`.
 *
 * Com `service_role`: na tela de login não há sessão, e `auditoria` só é
 * legível para `administracao:ver`.
 *
 * **Falha aberta, e só aqui.** Se a leitura der erro, o login segue para o
 * Supabase Auth — que tem limite de taxa próprio por IP — em vez de trancar a
 * organização inteira. O resto do Portal falha fechado; um limitador de
 * tentativas que falha fechado transforma um soluço da tabela de log em
 * ninguém entrar. O erro vai alto para o console, com a chave, para não passar
 * despercebido.
 */
export async function situacaoDoLogin(
  chave: string,
  agora: Date = new Date(),
): Promise<SituacaoDeBloqueio> {
  const admin = criarClienteAdmin();

  const { data, error } = await admin
    .from("auditoria")
    .select("acao, criado_em")
    .eq("detalhes->>chave_login", chave)
    .in("acao", [...ACOES_DE_TENTATIVA])
    .gt("criado_em", inicioDaJanela(agora).toISOString())
    .order("criado_em", { ascending: false })
    // Mais que o limite não muda a resposta; o teto só protege a consulta.
    .limit(50);

  if (error) {
    console.error(
      `[bloqueio] NÃO FOI POSSÍVEL LER AS TENTATIVAS — login seguirá sem bloqueio. chave=${chave}`,
      error.message,
    );
    return { bloqueado: false, falhasRecentes: 0 };
  }

  return avaliarBloqueio(data ?? [], agora);
}
