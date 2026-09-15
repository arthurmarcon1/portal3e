import { z } from "zod";

/**
 * Filtros da trilha de auditoria (F2.2).
 *
 * Moram na URL, não em estado de tela: a trilha é consultada numa apuração, e
 * "olha este link" tem de abrir exatamente o mesmo recorte para quem recebe.
 * O CSV lê os mesmos parâmetros, pelo mesmo esquema — a exportação não pode
 * trazer um recorte diferente do que está na tela.
 *
 * Módulo puro: a tela (cliente), a query e o route handler usam o mesmo.
 */

export const POR_PAGINA = 100;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function dataValida(v: string): boolean {
  if (!ISO.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  // `new Date("2026-02-31")` não é inválida em JS: rola para março.
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * Parâmetro inválido vira "sem filtro", nunca erro: URL editada à mão ou link
 * velho abre a trilha inteira em vez de uma tela quebrada. O `catch` de cada
 * campo é o que garante isso campo a campo.
 */
const dataOpcional = z.string().trim().refine(dataValida).optional().catch(undefined);
const textoOpcional = z.string().trim().min(1).max(80).optional().catch(undefined);

export const esquemaFiltrosAuditoria = z.object({
  de: dataOpcional,
  ate: dataOpcional,
  usuario: z.uuid().optional().catch(undefined),
  acao: textoOpcional,
  entidade: textoOpcional,
  pagina: z.coerce.number().int().min(1).catch(1).default(1),
});

export type FiltrosAuditoria = z.infer<typeof esquemaFiltrosAuditoria>;

type Parametros = Record<string, string | string[] | undefined> | URLSearchParams;

export function lerFiltros(parametros: Parametros): FiltrosAuditoria {
  const bruto: Record<string, string | undefined> = {};
  const chaves = ["de", "ate", "usuario", "acao", "entidade", "pagina"] as const;

  for (const chave of chaves) {
    const valor =
      parametros instanceof URLSearchParams ? parametros.get(chave) : parametros[chave];
    // Parâmetro repetido (`?acao=a&acao=b`): vale o primeiro.
    const unico = Array.isArray(valor) ? valor[0] : valor;
    bruto[chave] = unico === null || unico === "" ? undefined : unico;
  }

  return esquemaFiltrosAuditoria.parse(bruto);
}

/** Query string do recorte. `pagina` só entra quando não é a primeira. */
export function paraQueryString(filtros: Partial<FiltrosAuditoria>): string {
  const q = new URLSearchParams();
  for (const chave of ["de", "ate", "usuario", "acao", "entidade"] as const) {
    const valor = filtros[chave];
    if (valor) q.set(chave, valor);
  }
  if (filtros.pagina && filtros.pagina > 1) q.set("pagina", String(filtros.pagina));
  const s = q.toString();
  return s ? `?${s}` : "";
}

/**
 * O período digitado é dia civil em Brasília, e `criado_em` é `timestamptz`.
 *
 * Offset fixo `-03:00`: o Brasil não tem horário de verão desde 2019. Se
 * voltar a ter, é aqui que muda. `ate` é inclusivo para quem lê ("até 14/09"
 * inclui o dia 14), então vira `< 15/09 00:00`.
 */
export function intervaloDoPeriodo(filtros: Pick<FiltrosAuditoria, "de" | "ate">): {
  desde: string | null;
  antesDe: string | null;
} {
  const desde = filtros.de ? `${filtros.de}T00:00:00-03:00` : null;

  let antesDe: string | null = null;
  if (filtros.ate) {
    const dia = new Date(`${filtros.ate}T00:00:00Z`);
    dia.setUTCDate(dia.getUTCDate() + 1);
    antesDe = `${dia.toISOString().slice(0, 10)}T00:00:00-03:00`;
  }

  return { desde, antesDe };
}

/**
 * Números de página a mostrar: primeira, última e as vizinhas da atual, com
 * `null` onde há salto. Paginação numerada (F2.2), nunca scroll infinito.
 */
export function paginasVisiveis(atual: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const marcadas = new Set([1, total, atual - 1, atual, atual + 1]);
  const ordenadas = [...marcadas].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);

  const resultado: (number | null)[] = [];
  for (const p of ordenadas) {
    const anterior = resultado[resultado.length - 1];
    if (typeof anterior === "number" && p - anterior > 1) resultado.push(null);
    resultado.push(p);
  }
  return resultado;
}
