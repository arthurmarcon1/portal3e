import type { Metadata } from "next";

import {
  listarContratos,
  opcoesContratantes,
  unidadesPorContratante,
} from "@/features/contratos/queries";
import { temPermissao } from "@/lib/auth/sessao";

import { TelaContratos } from "./tela-contratos";

export const metadata: Metadata = { title: "Contratos · Portal 3e" };

export default async function PaginaContratos() {
  const [dados, contratantes, unidades, podeCriar, podeEditar] = await Promise.all([
    listarContratos(),
    opcoesContratantes(),
    unidadesPorContratante(),
    temPermissao("contratos", "criar"),
    temPermissao("contratos", "editar"),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <h1 className="mb-1 text-xl">Contratos</h1>
      <p className="mb-5 text-sm text-texto-suave">
        O instrumento comercial entre a 3e e a contratante, com as unidades atendidas.
      </p>
      <TelaContratos
        dados={dados}
        contratantes={contratantes}
        unidadesPorContratante={unidades}
        podeCriar={podeCriar}
        podeEditar={podeEditar}
      />
    </main>
  );
}
