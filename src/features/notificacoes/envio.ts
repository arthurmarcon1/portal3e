import "server-only";

import { emailAtivo, enviarEmail, type Mensagem } from "@/lib/email";
import { criarClienteAdmin } from "@/lib/supabase/admin";

import { caminhoDoAviso, dentroDaJanela, montarEmail, primeiroNome, type Motivo } from "./modelo";

/**
 * Fila de e-mail (F4.3): pega as linhas `canal = 'email'` e
 * `status = 'pendente'` que o banco criou (0022) e envia.
 *
 * **Atrás de uma flag.** Só envia com `NOTIFICACOES_EMAIL=ativo` E
 * `RESEND_API_KEY` E `EMAIL_REMETENTE`. Sem qualquer um dos três, nada sai e
 * as linhas continuam `pendente` — o registro de quem devia ser avisado já
 * existe; o envio espera o provedor. Nenhum outro provedor.
 *
 * `service_role` (invariante 2) porque é tarefa de sistema: roda no job,
 * sem usuário, e precisa ler o e-mail de quem recebe — que a RLS, com razão,
 * não mostra a ninguém além dele.
 *
 * Endereço: interno e contratante recebem no e-mail de login; funcionário, no
 * `email_pessoal` — o login dele é sintético (`<cpf>@func.<slug>.portal3e`)
 * e não recebe nada. Sem endereço, a linha vira `erro` com o motivo escrito,
 * e o aviso no Portal continua valendo.
 *
 * **Aviso velho não sai** (docs/06, 2026-10-01): pendente há mais de 48 h vira
 * `descartada` em vez de ser enviado. Prazo vencido e publicação de semanas
 * atrás não valem nada chegando atrasados, e a fila acumulada de uma vez
 * pareceria spam. O descarte só acontece quando o envio aconteceria — com a
 * flag desligada nada é tocado, e a idade conta a partir de `criado_em`.
 */

export type Transporte = (mensagem: Mensagem) => Promise<void>;

export type ResumoDoEnvio = {
  enviadas: number;
  erros: number;
  semEmail: number;
  /** Mais de 48 h na fila: viraram `descartada` sem envio. */
  descartadas: number;
  /** Ficaram pendentes: flag desligada, fora da janela, ou falha que ainda tenta de novo. */
  retidas: number;
  motivoRetencao: "flag_desligada" | "fora_da_janela" | null;
};

const MAX_TENTATIVAS = 3;

/** Idade máxima de um aviso na fila. Mais velho que isso é descartado. */
export const IDADE_MAXIMA_HORAS = 48;

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export async function enviarPendentes(opcoes: {
  agora?: Date;
  limite?: number;
  /** Para teste: substitui o Resend e liga o envio sem a flag. */
  transporte?: Transporte;
} = {}): Promise<ResumoDoEnvio> {
  const admin = criarClienteAdmin();
  const agora = opcoes.agora ?? new Date();
  const ativo = opcoes.transporte !== undefined || emailAtivo();

  const { count } = await admin
    .from("notificacoes")
    .select("id", { count: "exact", head: true })
    .eq("canal", "email")
    .eq("status", "pendente");
  const pendentes = count ?? 0;

  const nada = { enviadas: 0, erros: 0, semEmail: 0, descartadas: 0 };
  if (!ativo) return { ...nada, retidas: pendentes, motivoRetencao: "flag_desligada" };
  if (!dentroDaJanela(agora)) {
    return { ...nada, retidas: pendentes, motivoRetencao: "fora_da_janela" };
  }

  // Antes de ler a fila: o que passou da idade não chega nem a ser montado.
  const limiteDeIdade = new Date(agora.getTime() - IDADE_MAXIMA_HORAS * 3_600_000).toISOString();
  const { data: velhas, error: erroDoDescarte } = await admin
    .from("notificacoes")
    .update({ status: "descartada" })
    .eq("canal", "email")
    .eq("status", "pendente")
    .lt("criado_em", limiteDeIdade)
    .select("id");
  if (erroDoDescarte) throw new Error(erroDoDescarte.message);

  const transporte: Transporte = opcoes.transporte ?? enviarEmail;
  const { data: fila, error } = await admin
    .from("notificacoes")
    .select(
      "id, motivo, referencia_tipo, referencia_id, tentativas, usuarios(nome, tipo, email_login, pessoas(email_pessoal))",
    )
    .eq("canal", "email")
    .eq("status", "pendente")
    .order("criado_em")
    .limit(opcoes.limite ?? 200);
  if (error) throw new Error(error.message);

  const resumo: ResumoDoEnvio = { ...nada, descartadas: velhas?.length ?? 0, retidas: 0, motivoRetencao: null };

  for (const n of fila ?? []) {
    const u = n.usuarios;
    const para = u ? (u.tipo === "funcionario" ? u.pessoas?.email_pessoal : u.email_login) : null;

    if (!u || !para) {
      await admin
        .from("notificacoes")
        .update({ status: "erro", erro: "sem e-mail cadastrado — o aviso fica só no Portal" })
        .eq("id", n.id);
      resumo.semEmail++;
      continue;
    }

    // Dado complementar do texto: prazo do documento, protocolo da solicitação.
    let prazo: string | null = null;
    let protocolo: string | null = null;
    if (n.referencia_tipo === "documentos" && n.referencia_id && n.motivo !== "validade") {
      const { data } = await admin.from("documentos").select("prazo_ciencia").eq("id", n.referencia_id).maybeSingle();
      prazo = data?.prazo_ciencia ?? null;
    } else if (n.referencia_tipo === "solicitacoes" && n.referencia_id) {
      const { data } = await admin.from("solicitacoes").select("protocolo").eq("id", n.referencia_id).maybeSingle();
      protocolo = data?.protocolo ?? null;
    }

    const email = montarEmail({
      motivo: (n.motivo ?? "publicado") as Motivo,
      primeiroNome: primeiroNome(u.nome),
      link: baseUrl() + caminhoDoAviso(n.referencia_tipo, n.referencia_id, u.tipo, n.motivo as Motivo | null),
      prazo,
      protocolo,
    });

    try {
      await transporte({ para, assunto: email.assunto, texto: email.texto, html: email.html });
      await admin
        .from("notificacoes")
        .update({ status: "enviada", enviada_em: new Date().toISOString(), erro: null })
        .eq("id", n.id);
      resumo.enviadas++;
    } catch (erro) {
      const tentativas = n.tentativas + 1;
      const desiste = tentativas >= MAX_TENTATIVAS;
      await admin
        .from("notificacoes")
        .update({
          tentativas,
          status: desiste ? "erro" : "pendente",
          erro: erro instanceof Error ? erro.message.slice(0, 500) : "falha no envio",
        })
        .eq("id", n.id);
      if (desiste) resumo.erros++;
      else resumo.retidas++;
      console.error("[notificacoes] envio falhou", n.id, tentativas, erro);
    }
  }
  return resumo;
}

/** Lembretes e vencidos do dia (idempotente — pode rodar de hora em hora). */
export async function gerarAvisosDePrazo(): Promise<{ lembretes: number; vencidos: number }> {
  const { data, error } = await criarClienteAdmin().rpc("gerar_avisos_de_prazo");
  if (error) throw new Error(error.message);
  return data?.[0] ?? { lembretes: 0, vencidos: 0 };
}

/** Alerta de SST a 30 dias do vencimento (F5.2). Idempotente, como o de prazo. */
export async function gerarAvisosDeValidade(): Promise<number> {
  const { data, error } = await criarClienteAdmin().rpc("gerar_avisos_de_validade");
  if (error) throw new Error(error.message);
  return data ?? 0;
}
