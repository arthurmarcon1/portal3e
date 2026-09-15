import type { Metadata } from "next";

import { listarPessoas } from "@/features/pessoas/queries";
import { temPermissao } from "@/lib/auth/sessao";
import { paginaProtegida } from "@/lib/auth/pagina-protegida";

import { TelaPessoas } from "./tela-pessoas";

export const metadata: Metadata = { title: "Pessoas · Portal 3e" };

export default paginaProtegida(
  { tipo: "interno", modulo: "pessoas", acao: "ver" },
  async function PaginaPessoas() {
    const [dados, podeCriar] = await Promise.all([
      listarPessoas(),
      temPermissao("pessoas", "criar"),
    ]);

    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <h1 className="mb-1 text-xl">Pessoas</h1>
        <p className="mb-5 text-sm text-texto-suave">
          O quadro de funcionários e onde cada um está alocado hoje.
        </p>
        <TelaPessoas dados={dados} podeCriar={podeCriar} />
      </main>
    );
  },
);
