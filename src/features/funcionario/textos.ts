/**
 * Vocabulário da área do funcionário (docs/04, "Linguagem da área do
 * funcionário").
 *
 * Quem lê é auxiliar de limpeza, porteiro, vigia — gente que pode nunca ter
 * usado um portal. Por isso aqui não entra "ciência", "divergência",
 * "competência" nem "protocolo": esses termos continuam no banco, no código,
 * na área da equipe e no comprovante em PDF (que tem valor de prova), mas não
 * na tela do funcionário.
 *
 * Puro e sem `server-only`: as telas de servidor e os formulários de cliente
 * usam os mesmos textos.
 */

import type { StatusSolicitacao, TipoSolicitacao } from "@/features/solicitacoes/fluxo";
import { ROTULO_STATUS, ROTULO_TIPO } from "@/features/solicitacoes/fluxo";

/**
 * Quem atende o funcionário. **Único lugar desta informação**: no piloto é o
 * RH da 3e, mas num cliente futuro quem atende pode ser outro setor ou outra
 * empresa — ponto a revisar quando entrar cliente externo (docs/06).
 */
export const ATENDIMENTO = {
  /** Frase completa: "fale com o RH da 3e". */
  contato: "o RH da 3e",
  /** Depois de apresentado, na mesma tela: "o RH vai analisar". */
  curto: "o RH",
} as const;

/** "o RH" → "O RH", para começo de frase. */
export function maiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// ---------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

/** `2026-08-01` (ou `2026-08`) → `agosto de 2026`. `null` se não for data. */
export function mesPorExtenso(competencia: string | null): string | null {
  const m = competencia?.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const nome = MESES[Number(m[2]) - 1];
  return nome ? `${nome} de ${m[1]}` : null;
}

/** Data civil `2026-09-10` → `10 de setembro`. O ano só entra se não for o de `hoje`. */
export function dataPorExtenso(iso: string, hoje: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  const base = `${Number(dia)} de ${MESES[Number(mes) - 1]}`;
  return ano === hoje.slice(0, 4) ? base : `${base} de ${ano}`;
}

const PARTES_BRASILIA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Timestamp → `22 de outubro de 2026, às 10h31`, em Brasília. */
export function momentoPorExtenso(iso: string): string {
  const p = Object.fromEntries(
    PARTES_BRASILIA.formatToParts(new Date(iso)).map((x) => [x.type, x.value]),
  );
  return `${Number(p.day)} de ${MESES[Number(p.month) - 1]} de ${p.year}, às ${p.hour}h${p.minute}`;
}

// ---------------------------------------------------------------------
// Documentos
// ---------------------------------------------------------------------

/** O título que a publicação de espelhos grava: "Espelho de ponto — 08/2026". */
const TITULO_ESPELHO = /^Espelho de ponto — (\d{2})\/(\d{4})$/;

/**
 * O título como o funcionário lê. Só o título que a publicação em lote gera
 * é reescrito ("Espelho de ponto — 08/2026" → "Espelho de ponto de agosto de
 * 2026"); título digitado por alguém da equipe passa como está.
 */
export function tituloParaFuncionario(titulo: string): string {
  const m = titulo.match(TITULO_ESPELHO);
  if (!m) return titulo;
  const mes = mesPorExtenso(`${m[2]}-${m[1]}`);
  return mes ? `Espelho de ponto de ${mes}` : titulo;
}

/** O mês de um espelho, pelo título — para o diálogo de confirmação. */
export function mesDoEspelho(titulo: string): string | null {
  const m = titulo.match(TITULO_ESPELHO);
  if (!m) return null;
  return MESES[Number(m[1]) - 1] ?? null;
}

export type TextosDaResposta = {
  /** Uma linha antes de o documento abrir: o que fazer e o que acontece. */
  instrucao: string;
  pergunta: string;
  confirmar: string;
  apontarErro: string;
  dialogoTitulo: string;
  dialogoTexto: string;
  dialogoConfirmar: string;
};

/**
 * O que a tela de resposta diz, por tipo de documento.
 *
 * No espelho, confirmar grava que a pessoa **concorda** com a jornada — não
 * só que recebeu. Por isso o botão diz "Está tudo certo", e não "Confirmar
 * que recebi": quem tocasse achando que só acusou recebimento ficaria
 * registrado como de acordo (docs/04).
 */
export function textosDaResposta(chaveTipo: string, titulo: string): TextosDaResposta {
  const apontarErro = "Tem algo errado";
  if (chaveTipo === "espelho_ponto") {
    const mes = mesDoEspelho(titulo);
    return {
      instrucao: `Confira os dias e os horários abaixo. Se estiver tudo certo, toque em Está tudo certo. Se algo estiver errado, toque em Tem algo errado e explique: ${ATENDIMENTO.curto} vai analisar.`,
      pergunta: "Seus dias e horários deste mês estão certos?",
      confirmar: "Está tudo certo",
      apontarErro,
      dialogoTitulo: mes ? `Confirmar que o espelho de ${mes} está certo?` : "Confirmar que este espelho está certo?",
      dialogoTexto:
        "Fica registrado, com data e hora, que você conferiu e concorda com este espelho. Não dá para desfazer. Se achar um erro depois, faça um pedido de Correção de ponto.",
      dialogoConfirmar: "Sim, está certo",
    };
  }
  const nome =
    chaveTipo === "comunicado" ? "este comunicado" : chaveTipo === "norma_interna" ? "esta norma" : "este documento";
  return {
    instrucao: "Leia o documento abaixo. Depois, confirme que leu. Se tiver algo errado, toque em Tem algo errado.",
    pergunta: `Você leu ${nome}?`,
    confirmar: "Confirmar que li",
    apontarErro,
    dialogoTitulo: "Confirmar que você leu?",
    dialogoTexto: `Fica registrado, com data e hora, que você leu ${nome}. Não dá para desfazer.`,
    dialogoConfirmar: "Sim, li",
  };
}

/** Linha de prazo — a mesma na lista do início e na tela do documento. */
export function linhaDoPrazo(prazo: string, hoje: string): { texto: string; vencido: boolean } {
  const data = dataPorExtenso(prazo, hoje);
  return prazo < hoje
    ? { texto: `O prazo era ${data}. Você ainda pode responder.`, vencido: true }
    : { texto: `Responda até ${data}.`, vencido: false };
}

/** Situação da resposta, como badge (docs/04, "Status" — rótulos do funcionário). */
export const ROTULO_RESPOSTA: Record<string, string> = {
  pendente: "Falta responder",
  vencido: "Prazo passou",
  confirmacao: "Confirmado",
  divergencia: "Você apontou erro",
};

// ---------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------

/** "Pedido", no masculino — o funcionário não lê "solicitação". */
export const ROTULO_STATUS_FUNCIONARIO: Record<StatusSolicitacao, string> = {
  ...ROTULO_STATUS,
  aberta: "Enviado",
  em_analise: `${maiuscula(ATENDIMENTO.curto)} está vendo`,
  pendente_solicitante: "Esperando você",
  aprovada: "Aprovado",
  recusada: "Recusado",
  concluida: "Concluído",
  cancelada: "Cancelado",
};

export const ROTULO_TIPO_FUNCIONARIO: Record<TipoSolicitacao, string> = {
  ...ROTULO_TIPO,
  atualizacao_cadastral: "Atualizar meus dados",
  suporte: "Dúvida ou problema no Portal",
};

/** O tipo de pedido para quem tem uma dúvida — destino da linha de ajuda. */
export const TIPO_DUVIDA: TipoSolicitacao = "suporte";
