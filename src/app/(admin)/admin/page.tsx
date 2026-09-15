import type { Metadata } from "next";

import { paginaProtegida } from "@/lib/auth/pagina-protegida";

export const metadata: Metadata = { title: "Administração · Portal 3e" };

export default paginaProtegida(
  { tipo: "interno" },
  async function PaginaAdmin(_props, usuario) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <h1 className="text-xl">Área da equipe 3e</h1>
        <p className="mt-2 text-texto-suave">
          Você entrou como <strong className="font-medium">{usuario.nome}</strong>. Os
          módulos desta área entram nas próximas fases — ver docs/05-roadmap-prompts.md.
        </p>
      </main>
    );
  },
);
