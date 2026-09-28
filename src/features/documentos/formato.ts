/**
 * Apresentação de documento: datas, tamanho e rótulos.
 *
 * Puro e sem `server-only`: a listagem (cliente) e a página (servidor) usam
 * os mesmos textos. Data e hora sempre no fuso de Brasília — o servidor roda
 * em UTC, e publicar às 22h não pode aparecer como "amanhã".
 */

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

/** `2026-10-03` → `03/10/2026`. Data civil: não passa por fuso nenhum. */
export function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** Timestamp → `28/09/2026, 14:05`, em Brasília. */
export function formatarDataHora(iso: string | null): string {
  if (!iso) return "—";
  return DATA_HORA.format(new Date(iso));
}

export function formatarBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

export const ROTULO_ESCOPO = { individual: "Individual", coletivo: "Coletivo" } as const;
