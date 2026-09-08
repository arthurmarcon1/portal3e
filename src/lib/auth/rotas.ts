import type { Database } from "@/lib/supabase/types";

/**
 * Mapa de rotas por tipo de usuário.
 *
 * Módulo puro, sem `next/headers` e sem Supabase: o proxy (`src/proxy.ts`) e
 * as telas usam exatamente as mesmas regras, e o teste roda sem banco.
 */

export type TipoUsuario = Database["public"]["Enums"]["tipo_usuario"];

/** Área de cada tipo. O primeiro caminho é a rota inicial. */
export const AREAS: Record<TipoUsuario, readonly string[]> = {
  funcionario: ["/inicio", "/documentos", "/pedidos", "/perfil"],
  contratante: ["/cliente"],
  interno: ["/admin"],
};

/** Rotas abertas a quem não tem sessão. */
export const ROTAS_PUBLICAS = ["/login", "/recuperar-senha"] as const;

/** Rota que a troca obrigatória de senha ocupa até ser concluída. */
export const ROTA_PRIMEIRO_ACESSO = "/primeiro-acesso";

export function rotaInicial(tipo: TipoUsuario): string {
  return AREAS[tipo][0];
}

function comecaCom(pathname: string, prefixo: string): boolean {
  return pathname === prefixo || pathname.startsWith(`${prefixo}/`);
}

export function ehRotaPublica(pathname: string): boolean {
  return ROTAS_PUBLICAS.some((rota) => comecaCom(pathname, rota));
}

/**
 * A que tipo de usuário o caminho pertence.
 *
 * `null` quer dizer rota comum (raiz, primeiro acesso, API) — quem decide o
 * acesso ali é a própria rota, não o proxy.
 */
export function areaDoCaminho(pathname: string): TipoUsuario | null {
  for (const [tipo, prefixos] of Object.entries(AREAS) as [
    TipoUsuario,
    readonly string[],
  ][]) {
    if (prefixos.some((prefixo) => comecaCom(pathname, prefixo))) return tipo;
  }
  return null;
}

/**
 * Valida o `destino` que o proxy guardou ao barrar um acesso sem sessão.
 *
 * O valor vem da URL, então é entrada de usuário: só passa caminho interno
 * (começa com `/` e não com `//`, que o navegador leria como outro host) e que
 * pertença à área do próprio tipo. Qualquer outra coisa devolve `null` e o
 * login cai na rota inicial.
 */
export function destinoPermitido(
  destino: string | undefined | null,
  tipo: TipoUsuario,
): string | null {
  if (!destino) return null;
  if (!destino.startsWith("/") || destino.startsWith("//")) return null;

  const caminho = destino.split(/[?#]/)[0];
  return areaDoCaminho(caminho) === tipo ? destino : null;
}
