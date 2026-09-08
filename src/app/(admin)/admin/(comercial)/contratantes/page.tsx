import type { Metadata } from "next";

import { listarContratantes } from "@/features/contratos/queries";
import { temPermissao } from "@/lib/auth/sessao";

import { TelaContratantes } from "./tela-contratantes";

export const metadata: Metadata = { title: "Contratantes · Portal 3e" };

export default async function PaginaContratantes() {
  const [dados, podeCriar, podeEditar] = await Promise.all([
    listarContratantes(),
    temPermissao("contratos", "criar"),
    temPermissao("contratos", "editar"),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <h1 className="mb-1 text-xl">Contratantes</h1>
      <p className="mb-5 text-sm text-texto-suave">
        As empresas clientes que contratam mão de obra da 3e.
      </p>
      <TelaContratantes dados={dados} podeCriar={podeCriar} podeEditar={podeEditar} />
    </main>
  );
}
