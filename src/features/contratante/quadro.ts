/**
 * Regras puras da área do contratante (F5.1) — sem banco, testadas em unidade.
 *
 * O que chega aqui já veio recortado pelo banco (`quadro_do_contratante`,
 * 0023): o CPF é só o final de 3 dígitos. Nada neste arquivo recebe, nem
 * poderia remontar, o CPF completo.
 */

export type SituacaoAlocacao = "ativa" | "afastado" | "ferias" | "encerrada";

export type PessoaDoQuadro = {
  pessoa_id: string;
  nome: string;
  matricula: string | null;
  cpf_final: string;
  funcao: string;
  contrato_id: string;
  contrato_numero: string;
  unidade_id: string;
  unidade_nome: string;
  situacao: SituacaoAlocacao;
  data_inicio: string;
};

/** Os campos de docs/02 — e só eles. O teste de integração compara com isto. */
export const CAMPOS_DO_QUADRO = [
  "pessoa_id",
  "nome",
  "matricula",
  "cpf_final",
  "funcao",
  "contrato_id",
  "contrato_numero",
  "unidade_id",
  "unidade_nome",
  "situacao",
  "data_inicio",
] as const satisfies readonly (keyof PessoaDoQuadro)[];

export const ROTULO_SITUACAO: Record<SituacaoAlocacao, string> = {
  ativa: "Em atividade",
  ferias: "Em férias",
  afastado: "Afastado",
  encerrada: "Encerrada",
};

/** `998` → `***.***.**9-98`: a máscara de docs/02, só os 3 últimos dígitos. */
export function cpfParcial(final: string): string {
  const d = final.replace(/\D/g, "").slice(-3).padStart(3, "*");
  return `***.***.**${d[0]}-${d.slice(1)}`;
}

export type SituacaoDaUnidade = {
  unidade_id: string;
  unidade_nome: string;
  contrato_numero: string;
  alocados: number;
  ativa: number;
  ferias: number;
  afastado: number;
};

/**
 * Situação do quadro por unidade e contrato — o que a F5.1 chama de
 * "frequência consolidada" enquanto o ponto não chega ao Portal (docs/06).
 * Conta alocações, não pessoas: quem está em duas unidades conta nas duas.
 */
export function situacaoPorUnidade(quadro: PessoaDoQuadro[]): SituacaoDaUnidade[] {
  const grupos = new Map<string, SituacaoDaUnidade>();
  for (const p of quadro) {
    const chave = `${p.contrato_id}:${p.unidade_id}`;
    let g = grupos.get(chave);
    if (!g) {
      g = {
        unidade_id: p.unidade_id,
        unidade_nome: p.unidade_nome,
        contrato_numero: p.contrato_numero,
        alocados: 0,
        ativa: 0,
        ferias: 0,
        afastado: 0,
      };
      grupos.set(chave, g);
    }
    g.alocados++;
    if (p.situacao === "ativa" || p.situacao === "ferias" || p.situacao === "afastado") g[p.situacao]++;
  }
  return [...grupos.values()].sort(
    (a, b) =>
      a.contrato_numero.localeCompare(b.contrato_numero, "pt-BR") ||
      a.unidade_nome.localeCompare(b.unidade_nome, "pt-BR"),
  );
}

/** Pessoas distintas (uma pessoa pode ter duas alocações vigentes). */
export function totalDePessoas(quadro: PessoaDoQuadro[]): number {
  return new Set(quadro.map((p) => p.pessoa_id)).size;
}
