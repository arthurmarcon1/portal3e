import { redirect } from "next/navigation";

import { getUsuario, rotaInicial } from "@/lib/auth/sessao";

/**
 * Raiz: só encaminha.
 *
 * O proxy já resolve isto antes de renderizar; a página existe para o caso de
 * acesso direto e para deixar a regra explícita em um lugar só (`rotaInicial`).
 */
export default async function Pagina() {
  const usuario = await getUsuario();
  redirect(usuario ? rotaInicial(usuario.tipo) : "/login");
}
