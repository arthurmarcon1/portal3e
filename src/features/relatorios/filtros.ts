import type { TipoDeFiltro } from "./definicoes";

/**
 * Recorte do relatório, lido da URL (tela e rota usam o mesmo). Puro.
 *
 * Período: `de` e `ate` em aaaa-mm-dd, padrão dos últimos 30 dias, no máximo
 * 366 dias. Competência: `competencia` em aaaa-mm, padrão o mês corrente.
 */

export type Recorte =
  | { tipo: "nenhum" }
  | { tipo: "periodo"; de: string; ate: string }
  | { tipo: "competencia"; competencia: string };

export const MAX_DIAS = 366;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

function somarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function valida(iso: string): boolean {
  return DATA.test(iso) && !Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) && new Date(`${iso}T00:00:00Z`).toISOString().startsWith(iso);
}

export function lerRecorte(
  tipo: TipoDeFiltro,
  params: URLSearchParams,
  hoje: string,
): { ok: true; recorte: Recorte } | { ok: false; erro: string } {
  if (tipo === "nenhum") return { ok: true, recorte: { tipo } };

  if (tipo === "competencia") {
    const competencia = params.get("competencia") || hoje.slice(0, 7);
    if (!MES.test(competencia)) return { ok: false, erro: "Competência inválida. Use o formato aaaa-mm." };
    return { ok: true, recorte: { tipo, competencia } };
  }

  const ate = params.get("ate") || hoje;
  const de = params.get("de") || somarDias(ate, -30);
  if (!valida(de) || !valida(ate)) return { ok: false, erro: "Data inválida no período. Use o formato aaaa-mm-dd." };
  if (de > ate) return { ok: false, erro: "O início do período vem depois do fim." };
  if (Date.parse(ate) - Date.parse(de) > MAX_DIAS * 86_400_000) {
    return { ok: false, erro: `O período pode ter no máximo ${MAX_DIAS} dias.` };
  }
  return { ok: true, recorte: { tipo, de, ate } };
}

function br(iso: string): string {
  const [a, m, d] = iso.split("-");
  return d ? `${d}/${m}/${a}` : `${m}/${a}`;
}

export function descreverRecorte(r: Recorte): string {
  if (r.tipo === "periodo") return `Período de ${br(r.de)} a ${br(r.ate)}`;
  if (r.tipo === "competencia") return `Competência ${br(r.competencia)}`;
  return "Situação atual";
}

/** Para os links de download: o mesmo recorte, na query string. */
export function paraQuery(r: Recorte): string {
  if (r.tipo === "periodo") return `de=${r.de}&ate=${r.ate}`;
  if (r.tipo === "competencia") return `competencia=${r.competencia}`;
  return "";
}
