import type { Metadata } from "next";

import { resumoPorUnidade } from "@/features/sst/conformidade";
import { painelDeConformidade } from "@/features/sst/queries";
import { paginaProtegida } from "@/lib/auth/pagina-protegida";

import { TelaConformidade } from "./tela-conformidade";

export const metadata: Metadata = { title: "SST · Portal 3e" };

/**
 * Painel de conformidade de SST (F5.2): ASO e treinamento vencidos ou a
 * vencer, por contrato e unidade. Publicar norma, treinamento e ASO é a tela
 * de documentos, com o mesmo fluxo de ciência.
 */
export default paginaProtegida(
  { tipo: "interno", modulo: "sst", acao: "ver" },
  async function PaginaSst({ searchParams }: { searchParams: Promise<{ situacao?: string }> }) {
    const { situacao } = await searchParams;
    const linhas = await painelDeConformidade();
    const resumo = resumoPorUnidade(linhas);

    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <h1 className="mb-1 text-xl">SST</h1>
        <p className="mb-5 text-sm text-texto-suave">
          ASO e treinamentos por vencimento. Para publicar norma, treinamento ou ASO, use Documentos — o vencimento
          é informado ao publicar.
        </p>

        <section className="mb-8">
          <h2 className="text-lg">Por contrato e unidade</h2>
          {resumo.length === 0 ? (
            <p className="mt-2 text-texto-suave">Nenhum documento com vencimento no seu alcance ainda.</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-lg border border-borda">
              <table className="w-full text-sm">
                <thead className="bg-fundo-alt text-left text-texto-suave">
                  <tr>
                    <th className="px-3 py-2 font-normal">Contrato</th>
                    <th className="px-3 py-2 font-normal">Unidade</th>
                    <th className="px-3 py-2 text-right font-normal">Vencidos</th>
                    <th className="px-3 py-2 text-right font-normal">A vencer (30 dias)</th>
                    <th className="px-3 py-2 text-right font-normal">Em dia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borda tabular-nums">
                  {resumo.map((r) => (
                    <tr key={`${r.contrato_numero}:${r.unidade_id}`}>
                      <td className="px-3 py-2">{r.contrato_numero}</td>
                      <td className="px-3 py-2">{r.unidade_nome}</td>
                      <td className={`px-3 py-2 text-right ${r.vencido > 0 ? "text-erro" : ""}`}>{r.vencido}</td>
                      <td className={`px-3 py-2 text-right ${r.a_vencer > 0 ? "text-alerta" : ""}`}>{r.a_vencer}</td>
                      <td className="px-3 py-2 text-right">{r.em_dia}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <h2 className="mb-3 text-lg">Por pessoa</h2>
        <TelaConformidade key={situacao ?? ""} linhas={linhas} situacaoInicial={situacao} />
      </main>
    );
  },
);
