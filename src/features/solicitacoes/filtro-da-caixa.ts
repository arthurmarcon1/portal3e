/**
 * Filtro inicial da caixa de entrada, lido da URL. Puro.
 *
 * Existe para o contador do início abrir a caixa já no recorte que ele
 * conta ("3 vencidas" abre só as vencidas). Valor fora da lista é ignorado —
 * a caixa abre no padrão, em vez de quebrar por um link editado à mão.
 */

export const COMIGO = "comigo";
export const SEM_RESPONSAVEL = "sem";
export const VENCIDAS = "vencidas";

export type FiltroDaCaixa = { responsavel: "" | typeof COMIGO | typeof SEM_RESPONSAVEL; prazo: "" | typeof VENCIDAS };

export function lerFiltroDaCaixa(params: { responsavel?: string; prazo?: string }): FiltroDaCaixa {
  const responsavel = params.responsavel === COMIGO || params.responsavel === SEM_RESPONSAVEL ? params.responsavel : "";
  const prazo = params.prazo === VENCIDAS ? VENCIDAS : "";
  return { responsavel, prazo };
}
