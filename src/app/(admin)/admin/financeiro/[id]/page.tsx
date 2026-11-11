import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Paperclip } from "lucide-react";

import { BadgeStatus } from "@/components/badge-status";
import { CATEGORIAS, ehCategoria, ROTULOS_GRUPO } from "@/features/financeiro/categorias";
import { formatarPercentual, formatarReais, mesPorExtenso, primeiroDiaDoMes } from "@/features/financeiro/painel";
import { detalheDoContrato } from "@/features/financeiro/queries";
import { idValido } from "@/features/documentos/entrega";
import { temPermissao } from "@/lib/auth/sessao";
import { paginaProtegida } from "@/lib/auth/pagina-protegida";
import { cn } from "@/lib/utils";

import { AbrirCompetencia, AcoesDaCompetencia } from "./acoes-competencia";
import { BotaoDescartar } from "./botao-descartar";
import { FilaDeConferencia } from "./fila-conferencia";
import { FormularioLancamento } from "./formulario-lancamento";

export const metadata: Metadata = { title: "Financeiro do contrato · Portal 3e" };

const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export default paginaProtegida(
  { tipo: "interno", modulo: "financeiro", acao: "ver" },
  async function PaginaFinanceiroDoContrato({
    params,
    searchParams,
  }: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ mes?: string }>;
  }) {
    const [{ id }, { mes }] = await Promise.all([params, searchParams]);
    if (!idValido(id)) notFound();

    const [detalhe, podeCriar, podeEditar] = await Promise.all([
      detalheDoContrato(id, primeiroDiaDoMes(mes)),
      temPermissao("financeiro", "criar"),
      temPermissao("financeiro", "editar"),
    ]);
    if (!detalhe) notFound();

    const { contrato, competencia, painel, postos, lancamentos } = detalhe;
    const aberta = competencia?.status === "aberta";
    const emConferencia = lancamentos.filter((l) => l.status === "em_conferencia");
    const vigente = detalhe.planilhas.find((p) => p.status === "ativo") ?? null;
    const base = `/admin/financeiro/${contrato.id}`;

    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8 lg:py-8">
        <Link href="/admin/financeiro" className="text-sm text-acao hover:underline">
          Financeiro dos contratos
        </Link>
        <div className="mb-5 mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">
              Contrato {contrato.numero} · {contrato.contratante}
            </h1>
            {contrato.descricao ? <p className="mt-1 text-sm text-texto-suave">{contrato.descricao}</p> : null}
          </div>
          {podeCriar ? (
            <Link
              href={`/admin/financeiro/importar?contrato=${contrato.id}`}
              className="inline-flex min-h-11 items-center rounded-md border border-borda bg-fundo px-4 text-sm font-medium hover:bg-fundo-hover"
            >
              {vigente ? "Importar nova versão da planilha" : "Importar planilha de custo"}
            </Link>
          ) : null}
        </div>

        {detalhe.planilhas.length === 0 ? (
          <div className="rounded-lg border border-borda bg-fundo p-6">
            <p className="font-medium">Este contrato ainda não tem planilha de custo.</p>
            <p className="mt-1 text-sm text-texto-suave">
              Sem a planilha não há valor cobrado nem custo previsto para comparar com o que for lançado.
            </p>
          </div>
        ) : (
          <>
            {/* Meses do contrato */}
            <nav aria-label="Meses do contrato" className="mb-5 flex flex-wrap items-center gap-2">
              {detalhe.competencias.map((c) => {
                const atual = competencia?.id === c.id;
                return (
                  <Link
                    key={c.id}
                    href={`${base}?mes=${c.mes.slice(0, 7)}`}
                    aria-current={atual ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm",
                      atual ? "border-acao bg-acao-suave font-medium text-acao" : "border-borda bg-fundo hover:bg-fundo-hover",
                    )}
                  >
                    {mesPorExtenso(c.mes)}
                    {c.status === "aberta" ? <span className="text-xs text-alerta">aberta</span> : null}
                  </Link>
                );
              })}
              {podeCriar ? <AbrirCompetencia contratoId={contrato.id} sugestao={detalhe.mesSemCompetencia} /> : null}
            </nav>

            {!competencia || !painel ? (
              <div className="mb-6 rounded-lg border border-borda bg-fundo p-6">
                <p className="font-medium">
                  {detalhe.mesSemCompetencia
                    ? `${mesPorExtenso(detalhe.mesSemCompetencia)} ainda não foi aberto.`
                    : "Nenhum mês aberto ainda."}
                </p>
                <p className="mt-1 text-sm text-texto-suave">
                  Abra o mês para começar a lançar notas, folha e despesas. O previsto do mês sai da planilha que
                  vale nele.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-base font-semibold">
                    {mesPorExtenso(competencia.mes)}
                    <BadgeStatus status={competencia.status} />
                    <span className="text-sm font-normal text-texto-suave">planilha versão {competencia.planilha_versao}</span>
                  </h2>
                  {podeEditar ? (
                    <AcoesDaCompetencia
                      competenciaId={competencia.id}
                      status={competencia.status}
                      mes={mesPorExtenso(competencia.mes)}
                      pendentes={emConferencia.length}
                    />
                  ) : null}
                </div>

                {/* Números do mês */}
                <section aria-label="Resumo do mês" className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Numero
                    rotulo="Receita do mês"
                    valor={formatarReais(painel.linhas[0].realizado)}
                    nota={painel.semFaturamento ? "Nota do mês ainda não lançada" : `Previsto ${formatarReais(painel.linhas[0].previsto)}`}
                    alerta={painel.semFaturamento}
                  />
                  <Numero
                    rotulo="Custos do mês"
                    valor={formatarReais(painel.linhas.slice(1).reduce((s, l) => s + l.realizado, 0))}
                    nota={`Previsto ${formatarReais(painel.linhas.slice(1).reduce((s, l) => s + l.previsto, 0))}${painel.tributoEstimado ? " · tributo estimado" : ""}`}
                  />
                  <Numero
                    rotulo="Resultado"
                    valor={formatarReais(painel.resultado.realizado)}
                    nota={`Previsto ${formatarReais(painel.resultado.previsto)}`}
                    erro={!painel.semFaturamento && painel.resultado.realizado < 0}
                  />
                  <Numero
                    rotulo="Margem"
                    valor={painel.semFaturamento ? "—" : formatarPercentual(painel.margem.realizada)}
                    nota={`Prevista ${formatarPercentual(painel.margem.prevista)}`}
                    alerta={
                      !painel.semFaturamento &&
                      painel.margem.realizada !== null &&
                      painel.margem.prevista !== null &&
                      painel.margem.realizada < painel.margem.prevista
                    }
                  />
                </section>

                {painel.aConferir.quantidade > 0 ? (
                  <p role="status" className="mb-4 rounded-md border border-alerta/40 bg-fundo px-4 py-3 text-sm">
                    <span className="font-medium text-alerta">
                      {painel.aConferir.quantidade} {painel.aConferir.quantidade === 1 ? "lançamento" : "lançamentos"} a conferir
                    </span>{" "}
                    somando {formatarReais(painel.aConferir.valor)}. Eles só entram nos números depois de conferidos.
                  </p>
                ) : null}

                {/* Previsto × realizado */}
                <section aria-labelledby="comparativo" className="mb-6 overflow-x-auto rounded-lg border border-borda bg-fundo">
                  <h3 id="comparativo" className="px-4 pt-4 text-sm font-semibold">Previsto na planilha × lançado no mês</h3>
                  <table className="mt-2 w-full min-w-[640px] text-sm">
                    <thead className="bg-fundo-alt text-left text-texto-suave">
                      <tr>
                        <th scope="col" className="px-4 py-2 font-medium">Grupo</th>
                        <th scope="col" className="px-4 py-2 text-right font-medium">Previsto</th>
                        <th scope="col" className="px-4 py-2 text-right font-medium">Lançado</th>
                        <th scope="col" className="px-4 py-2 text-right font-medium">Diferença</th>
                        <th scope="col" className="px-4 py-2 text-right font-medium">A conferir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {painel.linhas.map((l) => {
                        // Receita abaixo do previsto é ruim; despesa acima do previsto é ruim.
                        const ruim = l.grupo === "receita" ? l.diferenca < 0 : l.diferenca > 0;
                        return (
                          <tr key={l.grupo} className="border-t border-borda">
                            <th scope="row" className="px-4 py-2.5 text-left font-normal">
                              {ROTULOS_GRUPO[l.grupo]}
                              {l.grupo === "operacao" ? (
                                <span className="block text-xs text-texto-suave">previsto: custos indiretos da planilha</span>
                              ) : null}
                              {l.grupo === "tributos" && painel.tributoEstimado ? (
                                <span className="block text-xs text-texto-suave">estimado pela alíquota da planilha</span>
                              ) : null}
                            </th>
                            <td className="px-4 py-2.5 text-right tabular-nums">{formatarReais(l.previsto)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{formatarReais(l.realizado)}</td>
                            <td className={cn("px-4 py-2.5 text-right tabular-nums", ruim && l.diferenca !== 0 && "text-alerta")}>
                              {l.diferenca > 0 ? "+" : ""}
                              {formatarReais(l.diferenca)}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-texto-suave">
                              {l.aConferir ? formatarReais(l.aConferir) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </section>

                {emConferencia.length > 0 ? (
                  <FilaDeConferencia itens={emConferencia} podeEditar={podeEditar && aberta} />
                ) : null}

                {aberta && podeCriar ? (
                  <FormularioLancamento
                    competenciaId={competencia.id}
                    postos={postos.map((p) => ({ id: p.id, nome: `${p.cargo} (${p.quantidade})` }))}
                  />
                ) : null}

                {/* Lançamentos do mês */}
                <section aria-labelledby="lancamentos" className="mb-6">
                  <h3 id="lancamentos" className="mb-2 text-base font-semibold">Lançamentos de {mesPorExtenso(competencia.mes)}</h3>
                  {lancamentos.length === 0 ? (
                    <p className="rounded-lg border border-borda bg-fundo px-4 py-4 text-sm text-texto-suave">
                      Nenhum lançamento ainda. Comece pela nota fiscal do mês e pela folha.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-borda bg-fundo">
                      <table className="w-full min-w-[860px] text-sm">
                        <thead className="bg-fundo-alt text-left text-texto-suave">
                          <tr>
                            <th scope="col" className="px-3 py-2 font-medium">Data</th>
                            <th scope="col" className="px-3 py-2 font-medium">Tipo</th>
                            <th scope="col" className="px-3 py-2 font-medium">Descrição</th>
                            <th scope="col" className="px-3 py-2 font-medium">Posto</th>
                            <th scope="col" className="px-3 py-2 text-right font-medium">Valor</th>
                            <th scope="col" className="px-3 py-2 font-medium">Origem</th>
                            <th scope="col" className="px-3 py-2 font-medium">Situação</th>
                            <th scope="col" className="px-3 py-2"><span className="sr-only">Ações</span></th>
                          </tr>
                        </thead>
                        <tbody>
                          {lancamentos.map((l) => {
                            const def = ehCategoria(l.categoria) ? CATEGORIAS[l.categoria] : null;
                            const negativo = def?.sinal === -1 || l.natureza === "despesa";
                            return (
                              <tr key={l.id} className={cn("border-t border-borda align-top", l.status === "descartado" && "text-texto-suave")}>
                                <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{dataBr(l.data_documento ?? l.criado_em)}</td>
                                <td className="px-3 py-2.5">{def?.rotulo ?? l.categoria}</td>
                                <td className="px-3 py-2.5">
                                  <span className={cn(l.status === "descartado" && "line-through")}>{l.descricao}</span>
                                  {l.motivo_descarte ? <span className="block text-xs">Descartado: {l.motivo_descarte}</span> : null}
                                  {l.anexos.map((a) => (
                                    <a
                                      key={a.id}
                                      href={`/api/financeiro/anexos/${a.id}`}
                                      target="_blank"
                                      rel="noopener"
                                      className="mt-1 flex items-center gap-1 text-xs text-acao hover:underline"
                                    >
                                      <Paperclip aria-hidden strokeWidth={1.5} className="size-3.5" />
                                      {a.nome}
                                    </a>
                                  ))}
                                </td>
                                <td className="px-3 py-2.5">{l.cargo ?? "—"}</td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                                  {negativo ? "− " : ""}
                                  {formatarReais(l.valor)}
                                </td>
                                <td className="px-3 py-2.5">{l.origem === "whatsapp" ? "WhatsApp" : "Portal"}</td>
                                <td className="px-3 py-2.5"><BadgeStatus status={l.status} /></td>
                                <td className="px-2 py-1.5 text-right">
                                  {podeEditar && aberta && l.status === "confirmado" ? (
                                    <BotaoDescartar lancamentoId={l.id} descricao={l.descricao} />
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                {/* Pessoal por posto */}
                <section aria-labelledby="por-posto" className="mb-8 overflow-x-auto rounded-lg border border-borda bg-fundo">
                  <h3 id="por-posto" className="px-4 pt-4 text-sm font-semibold">Pessoal por posto</h3>
                  <p className="px-4 text-xs text-texto-suave">
                    Só entra aqui o lançamento de pessoal que indicou o posto. Férias e afastamento costumam baixar o
                    custo do mês.
                  </p>
                  <table className="mt-2 w-full min-w-[520px] text-sm">
                    <thead className="bg-fundo-alt text-left text-texto-suave">
                      <tr>
                        <th scope="col" className="px-4 py-2 font-medium">Cargo</th>
                        <th scope="col" className="px-4 py-2 text-right font-medium">Postos</th>
                        <th scope="col" className="px-4 py-2 text-right font-medium">Previsto</th>
                        <th scope="col" className="px-4 py-2 text-right font-medium">Lançado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {painel.porPosto.map((p) => (
                        <tr key={p.id} className="border-t border-borda">
                          <th scope="row" className="px-4 py-2.5 text-left font-normal">{p.cargo}</th>
                          <td className="px-4 py-2.5 text-right tabular-nums">{p.quantidade}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{formatarReais(p.pessoalPrevisto)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{formatarReais(p.pessoalRealizado)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </>
            )}

            {/* Base do contrato */}
            <section aria-labelledby="base" className="rounded-lg border border-borda bg-fundo">
              <div className="flex flex-wrap items-end justify-between gap-2 px-4 pt-4">
                <h2 id="base" className="text-base font-semibold">Base do contrato</h2>
                {vigente ? (
                  <p className="text-sm text-texto-suave">
                    {formatarReais(vigente.valor_mensal)} por mês
                    {vigente.regime_tributario ? ` · ${vigente.regime_tributario}` : ""}
                    {vigente.meses_execucao ? ` · ${vigente.meses_execucao} meses` : ""}
                  </p>
                ) : null}
              </div>
              <div className="overflow-x-auto">
                <table className="mt-2 w-full min-w-[760px] text-sm">
                  <caption className="sr-only">Postos da planilha usada no mês</caption>
                  <thead className="bg-fundo-alt text-left text-texto-suave">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-medium">Cargo</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Postos</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Cobrado por posto</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Total</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Salário base</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Custo por empregado</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Lucro por posto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {postos.map((p) => (
                      <tr key={p.id} className="border-t border-borda">
                        <th scope="row" className="px-4 py-2.5 text-left font-normal">{p.cargo}</th>
                        <td className="px-4 py-2.5 text-right tabular-nums">{p.quantidade}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatarReais(p.valor_unitario)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatarReais(p.valor_total)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatarReais(p.salario_base)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {formatarReais(p.remuneracao + p.beneficios + p.insumos + p.encargos)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatarReais(p.lucro)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="grid gap-1 border-t border-borda px-4 py-3 text-sm text-texto-suave">
                {detalhe.planilhas.map((p) => (
                  <li key={p.id}>
                    Versão {p.versao} · vale a partir de {mesPorExtenso(p.vigente_desde)} · {formatarReais(p.valor_mensal)} ·{" "}
                    {p.arquivo_nome} · importada em {dataBr(p.criado_em)}
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>
    );
  },
);

function Numero({
  rotulo,
  valor,
  nota,
  alerta,
  erro,
}: {
  rotulo: string;
  valor: string;
  nota: string;
  alerta?: boolean;
  erro?: boolean;
}) {
  return (
    <div className="rounded-lg border border-borda bg-fundo px-4 py-3">
      <p className="text-sm text-texto-suave">{rotulo}</p>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums", erro && "text-erro")}>{valor}</p>
      <p className={cn("mt-0.5 text-sm", alerta ? "text-alerta" : "text-texto-suave")}>{nota}</p>
    </div>
  );
}
