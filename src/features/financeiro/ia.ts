/**
 * Leitura de lançamento por IA — interface plugável.
 *
 * O fornecedor ainda não foi escolhido (docs/06). A regra é a mesma para
 * qualquer um que entrar: a IA SUGERE, a equipe CONFERE. Tudo que a IA lê
 * nasce como lançamento com a sugestão guardada em `lancamentos.sugestao`, e
 * vai para a fila de conferência sempre que houver dúvida ou confiança baixa
 * — nunca direto para a margem do contrato.
 *
 * Quem implementa `LeitorDeLancamento` recebe o texto (já transcrito, se veio
 * áudio) ou a imagem da nota, e o contexto do contrato (os cargos da planilha
 * e o mês aberto), e devolve `SugestaoDeLancamento`. O webhook do WhatsApp
 * (próxima etapa) chama `leitorConfigurado()` e grava o resultado pelo mesmo
 * caminho do lançamento feito na tela.
 *
 * Puro, sem `server-only`, para a regra de conferência ter teste de unidade.
 * A implementação real, com chave de API, mora num arquivo `server-only`.
 */

import { CATEGORIAS, ehCategoria, type Categoria } from "./categorias";

export type ContextoDeLeitura = {
  contrato: string;
  /** Primeiro dia do mês em aberto. */
  competencia: string;
  cargos: { id: string; cargo: string }[];
};

export type SugestaoDeLancamento = {
  categoria: string;
  valor: number | null;
  descricao: string;
  data_documento: string | null;
  /** Cargo como a IA entendeu ("limpeza", "coordenador"). Casado com a planilha aqui. */
  cargo: string | null;
  /** 0 a 1, do fornecedor. */
  confianca: number;
  /** O que a IA não conseguiu decidir, em português, para a pergunta de volta. */
  duvidas: string[];
  /** O texto que ela leu: transcrição do áudio ou o que estava na foto. */
  transcricao: string | null;
};

export interface LeitorDeLancamento {
  transcreverAudio(audio: Uint8Array, mime: string): Promise<string>;
  lerTexto(texto: string, contexto: ContextoDeLeitura): Promise<SugestaoDeLancamento>;
  lerImagem(imagem: Uint8Array, mime: string, contexto: ContextoDeLeitura): Promise<SugestaoDeLancamento>;
}

/** Abaixo disso, mesmo sem dúvida declarada, alguém confere. */
export const CONFIANCA_MINIMA = 0.8;

export type LancamentoSugerido = {
  natureza: "receita" | "despesa";
  categoria: Categoria;
  valor: number;
  descricao: string;
  data_documento: string | null;
  posto_id: string | null;
  status: "confirmado" | "em_conferencia";
  duvidas: string[];
};

/**
 * Transforma a sugestão no lançamento que vai ser gravado, decidindo se ele
 * precisa de conferência. Devolve `null` quando não há nem valor nem
 * categoria que preste — aí o canal pergunta de novo, não grava.
 */
export function sugestaoParaLancamento(
  s: SugestaoDeLancamento,
  contexto: ContextoDeLeitura,
): LancamentoSugerido | null {
  const duvidas = [...s.duvidas];

  if (s.valor === null || !Number.isFinite(s.valor) || s.valor <= 0) return null;

  let categoria: Categoria = "outros";
  if (ehCategoria(s.categoria)) categoria = s.categoria;
  else duvidas.push("Qual é o tipo deste gasto?");

  let posto_id: string | null = null;
  if (s.cargo) {
    const alvo = s.cargo.trim().toLowerCase();
    const casados = contexto.cargos.filter((c) => c.cargo.toLowerCase().includes(alvo));
    if (casados.length === 1) posto_id = casados[0].id;
    else duvidas.push(`Qual posto: ${contexto.cargos.map((c) => c.cargo).join(", ")}?`);
  }

  const conferir = duvidas.length > 0 || !(s.confianca >= CONFIANCA_MINIMA);
  return {
    natureza: CATEGORIAS[categoria].natureza,
    categoria,
    valor: Math.round(s.valor * 100) / 100,
    descricao: s.descricao.trim() || CATEGORIAS[categoria].rotulo,
    data_documento: s.data_documento,
    posto_id,
    status: conferir ? "em_conferencia" : "confirmado",
    duvidas,
  };
}

/**
 * O leitor configurado no ambiente, ou `null` enquanto nenhum fornecedor foi
 * escolhido. Sem leitor, o lançamento é feito na tela, com a foto anexada.
 */
export function leitorConfigurado(): LeitorDeLancamento | null {
  return null;
}
