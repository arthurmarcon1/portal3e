/**
 * Ciência em andamento, para o início da equipe interna. Puro.
 *
 * "Campanha" é o que a equipe acompanha como uma coisa só: um comunicado
 * coletivo é um documento; os espelhos de um fechamento são centenas de
 * documentos individuais com o mesmo tipo e o mesmo título ("Espelho de ponto
 * — 08/2026"). Por isso individual agrupa por tipo + título, e coletivo fica
 * sozinho.
 *
 * Aqui só se escolhe QUAIS campanhas aparecer, a partir das pendências já
 * ordenadas por prazo. Os números da barra vêm de contagem exata no banco,
 * não destas linhas (que o PostgREST corta em `max_rows`).
 */

export type PendenciaComEscopo = {
  documento_id: string;
  titulo: string;
  tipo_nome: string;
  prazo_ciencia: string | null;
  escopo: "individual" | "coletivo";
  tipo_id: string;
};

export type Campanha = {
  chave: string;
  escopo: "individual" | "coletivo";
  titulo: string;
  tipo_nome: string;
  tipo_id: string;
  /** Um dos documentos do grupo — no coletivo, o próprio. */
  documento_id: string;
  /** O prazo mais próximo do grupo. */
  prazo: string | null;
};

/**
 * As `limite` campanhas mais urgentes: prazo mais próximo primeiro, sem prazo
 * por último, empate pelo título.
 */
export function campanhasMaisUrgentes(linhas: PendenciaComEscopo[], limite: number): Campanha[] {
  const grupos = new Map<string, Campanha>();
  for (const l of linhas) {
    const chave = l.escopo === "coletivo" ? `c:${l.documento_id}` : `i:${l.tipo_id}:${l.titulo}`;
    const atual = grupos.get(chave);
    if (!atual) {
      grupos.set(chave, {
        chave,
        escopo: l.escopo,
        titulo: l.titulo,
        tipo_nome: l.tipo_nome,
        tipo_id: l.tipo_id,
        documento_id: l.documento_id,
        prazo: l.prazo_ciencia,
      });
    } else if (l.prazo_ciencia !== null && (atual.prazo === null || l.prazo_ciencia < atual.prazo)) {
      atual.prazo = l.prazo_ciencia;
    }
  }
  return [...grupos.values()]
    .sort((a, b) => (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999") || a.titulo.localeCompare(b.titulo, "pt-BR"))
    .slice(0, limite);
}

/**
 * Percentual inteiro, arredondado para baixo: 339 de 340 é 99%, não 100% —
 * 100% só quando ninguém falta.
 */
export function percentual(parte: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.floor((parte / total) * 100));
}
