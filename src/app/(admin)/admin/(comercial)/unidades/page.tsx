import type { Metadata } from "next";

import { listarUnidades, opcoesContratantes } from "@/features/contratos/queries";
import { temPermissao } from "@/lib/auth/sessao";

import { TelaUnidades } from "./tela-unidades";

export const metadata: Metadata = { title: "Unidades · Portal 3e" };

export default async function PaginaUnidades() {
  const [dados, contratantes, podeCriar, podeEditar] = await Promise.all([
    listarUnidades(),
    opcoesContratantes(),
    temPermissao("contratos", "criar"),
    temPermissao("contratos", "editar"),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <h1 className="mb-1 text-xl">Unidades</h1>
      <p className="mb-5 text-sm text-texto-suave">
        Os locais físicos de alocação. Uma contratante pode ter várias.
      </p>
      <TelaUnidades
        dados={dados}
        contratantes={contratantes}
        podeCriar={podeCriar}
        podeEditar={podeEditar}
      />
    </main>
  );
}
