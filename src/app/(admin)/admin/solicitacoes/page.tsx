import type { Metadata } from "next";

import { hojeEmBrasilia } from "@/features/documentos/funcionario";
import { listarSolicitacoes, responsaveisPossiveis } from "@/features/solicitacoes/queries";
import { temPermissao } from "@/lib/auth/sessao";
import { paginaProtegida } from "@/lib/auth/pagina-protegida";

import { TelaCaixa } from "./tela-caixa";

export const metadata: Metadata = { title: "Solicitações · Portal 3e" };

export default paginaProtegida(
  { tipo: "interno", modulo: "solicitacoes", acao: "ver" },
  async function PaginaSolicitacoes(_props, usuario) {
    const podeEditar = await temPermissao("solicitacoes", "editar");
    const [dados, responsaveis] = await Promise.all([
      listarSolicitacoes(),
      podeEditar ? responsaveisPossiveis() : Promise.resolve([]),
    ]);

    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <h1 className="mb-1 text-xl">Solicitações</h1>
        <p className="mb-5 text-sm text-texto-suave">
          Pedidos de funcionários e de contratantes, e as divergências de ciência. O prazo sai do
          SLA de cada tipo, em dias úteis.
        </p>
        <TelaCaixa dados={dados} responsaveis={responsaveis} usuarioId={usuario.id} hoje={hojeEmBrasilia()} />
      </main>
    );
  },
);
