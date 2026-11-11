import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Upload } from "lucide-react";

import { BadgeStatus } from "@/components/badge-status";
import { formatarPercentual, formatarReais, mesPorExtenso } from "@/features/financeiro/painel";
import { listarContratosDoFinanceiro } from "@/features/financeiro/queries";
import { temPermissao } from "@/lib/auth/sessao";
import { paginaProtegida } from "@/lib/auth/pagina-protegida";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Financeiro · Portal 3e" };

/**
 * Financeiro dos contratos: a visão de todos os contratos que a pessoa
 * alcança, com a base cobrada e o resultado do último mês. Quem tem escopo
 * total (Admin geral) vê todos; quem tem escopo por contrato vê os seus — a
 * RLS decide, não esta tela.
 */
export default paginaProtegida(
  { tipo: "interno", modulo: "financeiro", acao: "ver" },
  async function PaginaFinanceiro() {
    const [contratos, podeImportar] = await Promise.all([
      listarContratosDoFinanceiro(),
      temPermissao("financeiro", "criar"),
    ]);

    const comBase = contratos.filter((c) => c.planilha);
    const semBase = contratos.filter((c) => !c.planilha);

    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8 lg:py-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="mb-1 text-xl font-semibold">Financeiro dos contratos</h1>
            <p className="text-sm text-texto-suave">
              O valor cobrado de cada contrato, o que foi lançado no mês e o resultado.
            </p>
          </div>
          {podeImportar ? (
            <Link
              href="/admin/financeiro/importar"
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-acao px-4 text-sm font-medium text-white hover:bg-acao-hover"
            >
              <Upload aria-hidden strokeWidth={1.5} className="size-4" />
              Importar planilha de custo
            </Link>
          ) : null}
        </div>

        {comBase.length === 0 ? (
          <div className="rounded-lg border border-borda bg-fundo p-6">
            <p className="font-medium">Nenhum contrato tem planilha de custo ainda.</p>
            <p className="mt-1 text-sm text-texto-suave">
              A planilha de custos e formação de preços da licitação é a base: ela diz quanto é cobrado
              por posto e quanto cada posto custa. Importe a de um contrato para começar.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-borda bg-fundo">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">Contratos com planilha de custo</caption>
              <thead className="bg-fundo-alt text-left text-texto-suave">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Contrato</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Cobrado por mês</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Último mês</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Resultado</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Margem</th>
                  <th scope="col" className="px-4 py-2.5"><span className="sr-only">Abrir</span></th>
                </tr>
              </thead>
              <tbody>
                {comBase.map((c) => (
                  <tr key={c.id} className="border-t border-borda hover:bg-fundo-hover">
                    <td className="px-4 py-3">
                      <Link href={`/admin/financeiro/${c.id}`} className="font-medium text-texto hover:underline">
                        {c.numero}
                      </Link>
                      <p className="text-texto-suave">{c.contratante}</p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatarReais(c.planilha!.valor_mensal)}
                      <p className="text-texto-suave">
                        {c.planilha!.postos} {c.planilha!.postos === 1 ? "posto" : "postos"} · versão {c.planilha!.versao}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {c.competencia ? (
                        <span className="flex flex-wrap items-center gap-2">
                          {mesPorExtenso(c.competencia.mes)}
                          <BadgeStatus status={c.competencia.status} />
                          {c.competencia.aConferir > 0 ? (
                            <span className="text-alerta">{c.competencia.aConferir} a conferir</span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-texto-suave">Nenhum mês aberto</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {c.competencia && c.competencia.receitaLancada ? (
                        <span className={cn(c.competencia.resultado < 0 && "text-erro")}>
                          {formatarReais(c.competencia.resultado)}
                        </span>
                      ) : (
                        <span className="text-texto-suave">Nota não lançada</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {c.competencia?.receitaLancada ? formatarPercentual(c.competencia.margem) : "—"}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <Link
                        href={`/admin/financeiro/${c.id}`}
                        aria-label={`Abrir o financeiro do contrato ${c.numero}`}
                        className="inline-flex size-11 items-center justify-center rounded-md hover:bg-fundo-alt"
                      >
                        <ChevronRight aria-hidden strokeWidth={1.5} className="size-5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {semBase.length > 0 ? (
          <section aria-labelledby="sem-base" className="mt-8">
            <h2 id="sem-base" className="text-base font-semibold">Contratos sem planilha de custo</h2>
            <p className="mt-1 text-sm text-texto-suave">
              Sem a planilha não há o que comparar. {podeImportar ? "Importe para ativar o painel." : "Peça ao Financeiro para importar."}
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {semBase.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-borda bg-fundo px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.numero}</span>
                    <span className="block truncate text-sm text-texto-suave">{c.contratante}</span>
                  </span>
                  {podeImportar ? (
                    <Link
                      href={`/admin/financeiro/importar?contrato=${c.id}`}
                      className="inline-flex min-h-11 shrink-0 items-center rounded-md px-3 text-sm font-medium text-acao hover:bg-acao-suave"
                    >
                      Importar
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    );
  },
);
