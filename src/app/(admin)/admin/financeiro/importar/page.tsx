import type { Metadata } from "next";
import Link from "next/link";

import { contratosParaImportar } from "@/features/financeiro/queries";
import { paginaProtegida } from "@/lib/auth/pagina-protegida";

import { TelaImportacao } from "./tela-importacao";

export const metadata: Metadata = { title: "Importar planilha de custo · Portal 3e" };

export default paginaProtegida(
  { tipo: "interno", modulo: "financeiro", acao: "criar" },
  async function PaginaImportarPlanilha({ searchParams }: { searchParams: Promise<{ contrato?: string }> }) {
    const [{ contrato }, contratos] = await Promise.all([searchParams, contratosParaImportar()]);
    const inicial = contratos.some((c) => c.id === contrato) ? contrato : undefined;

    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 lg:px-8 lg:py-8">
        <Link href="/admin/financeiro" className="text-sm text-acao hover:underline">
          Financeiro dos contratos
        </Link>
        <h1 className="mb-1 mt-2 text-xl font-semibold">Importar planilha de custo</h1>
        <p className="mb-6 max-w-3xl text-sm text-texto-suave">
          A planilha de custos e formação de preços da licitação: uma aba de resumo com cargo, quantidade e
          valor unitário, e uma aba por cargo com a composição. Ela vira a base do contrato. Aditivo ou
          reajuste entra como versão nova, a partir do mês em que passa a valer — os meses anteriores
          continuam com a versão antiga.
        </p>
        <TelaImportacao contratos={contratos} contratoInicial={inicial} />
      </main>
    );
  },
);
