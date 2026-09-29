/**
 * Conformidade de SST (F5.2) — regras puras, testadas em unidade.
 *
 * Recebe o que a RLS deixou o usuário ler (documentos que vencem e as
 * alocações vigentes das pessoas) e decide, por pessoa, qual documento é o
 * vigente e em que situação ele está. Quem não vê ASO (categoria `medico`)
 * nem recebe a linha — o recorte é do banco, não daqui.
 */

/** Janela do "a vencer" e do alerta automático (docs/05, F5.2). */
export const JANELA_DIAS = 30;

export type RegraDeValidade = "por_pessoa" | "por_titulo";
export type Situacao = "vencido" | "a_vencer" | "em_dia";

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  vencido: "Vencido",
  a_vencer: `Vence em até ${JANELA_DIAS} dias`,
  em_dia: "Em dia",
};

export type DocumentoQueVence = {
  id: string;
  titulo: string;
  tipo_id: string;
  tipo_nome: string;
  regra: RegraDeValidade;
  pessoa_id: string;
  pessoa_nome: string;
  valido_ate: string;
};

export type Lotacao = {
  pessoa_id: string;
  contrato_id: string;
  contrato_numero: string;
  unidade_id: string;
  unidade_nome: string;
};

export type LinhaDeConformidade = {
  documento_id: string;
  pessoa_id: string;
  pessoa_nome: string;
  tipo_nome: string;
  titulo: string;
  valido_ate: string;
  dias: number;
  situacao: Situacao;
  lotacoes: Lotacao[];
};

/** Chave da renovação: ASO por pessoa; treinamento por pessoa e título. */
export function chaveDeRenovacao(d: DocumentoQueVence): string {
  const base = `${d.pessoa_id}:${d.tipo_id}`;
  return d.regra === "por_pessoa" ? base : `${base}:${d.titulo.trim().toLowerCase()}`;
}

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
}

export function situacaoDe(validoAte: string, hoje: string): { situacao: Situacao; dias: number } {
  const dias = diasEntre(hoje, validoAte);
  if (dias < 0) return { situacao: "vencido", dias };
  if (dias <= JANELA_DIAS) return { situacao: "a_vencer", dias };
  return { situacao: "em_dia", dias };
}

/**
 * Uma linha por renovação vigente: entre documentos da mesma chave, vale o
 * que vence por último. Pessoa sem alocação vigente fica de fora — quem saiu
 * não tem o que renovar.
 */
export function conformidade(
  documentos: DocumentoQueVence[],
  lotacoes: Lotacao[],
  hoje: string,
): LinhaDeConformidade[] {
  const vigentes = new Map<string, DocumentoQueVence>();
  for (const d of documentos) {
    const chave = chaveDeRenovacao(d);
    const atual = vigentes.get(chave);
    if (!atual || d.valido_ate > atual.valido_ate) vigentes.set(chave, d);
  }

  const porPessoa = new Map<string, Lotacao[]>();
  for (const l of lotacoes) porPessoa.set(l.pessoa_id, [...(porPessoa.get(l.pessoa_id) ?? []), l]);

  const ordem: Record<Situacao, number> = { vencido: 0, a_vencer: 1, em_dia: 2 };
  return [...vigentes.values()]
    .filter((d) => porPessoa.has(d.pessoa_id))
    .map((d) => ({
      documento_id: d.id,
      pessoa_id: d.pessoa_id,
      pessoa_nome: d.pessoa_nome,
      tipo_nome: d.tipo_nome,
      titulo: d.titulo,
      valido_ate: d.valido_ate,
      ...situacaoDe(d.valido_ate, hoje),
      lotacoes: porPessoa.get(d.pessoa_id)!,
    }))
    .sort((a, b) => ordem[a.situacao] - ordem[b.situacao] || a.valido_ate.localeCompare(b.valido_ate));
}

export type ResumoDaUnidade = {
  contrato_numero: string;
  unidade_id: string;
  unidade_nome: string;
  vencido: number;
  a_vencer: number;
  em_dia: number;
};

/** Contagem por contrato e unidade (pessoa em duas unidades conta nas duas). */
export function resumoPorUnidade(linhas: LinhaDeConformidade[]): ResumoDaUnidade[] {
  const grupos = new Map<string, ResumoDaUnidade>();
  for (const l of linhas) {
    for (const lot of l.lotacoes) {
      const chave = `${lot.contrato_id}:${lot.unidade_id}`;
      const g = grupos.get(chave) ?? {
        contrato_numero: lot.contrato_numero,
        unidade_id: lot.unidade_id,
        unidade_nome: lot.unidade_nome,
        vencido: 0,
        a_vencer: 0,
        em_dia: 0,
      };
      g[l.situacao]++;
      grupos.set(chave, g);
    }
  }
  return [...grupos.values()].sort(
    (a, b) =>
      a.contrato_numero.localeCompare(b.contrato_numero, "pt-BR") ||
      a.unidade_nome.localeCompare(b.unidade_nome, "pt-BR"),
  );
}
