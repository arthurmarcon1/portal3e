import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BadgeDollarSign,
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Layers,
  Paperclip,
  Percent,
  PieChart,
  PiggyBank,
  Plus,
  Receipt,
  TriangleAlert,
  Upload,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { BadgeStatus } from "@/components/badge-status";
import { IconeEmQuadro, type Tom } from "@/components/icone-em-quadro";
import { CATEGORIAS, ehCategoria, ROTULOS_GRUPO } from "@/features/financeiro/categorias";
import { formatarPercentual, formatarReais, mesPorExtenso, primeiroDiaDoMes, type Painel } from "@/features/financeiro/painel";
import { detalheDoContrato, type LancamentoDaTela } from "@/features/financeiro/queries";
import { idValido } from "@/features/documentos/entrega";
import { temPermissao } from "@/lib/auth/sessao";
import { paginaProtegida } from "@/lib/auth/pagina-protegida";
import { cn } from "@/lib/utils";

import { AbrirCompetencia, AcoesDaCompetencia } from "./acoes-competencia";
import { BotaoDescartar } from "./botao-descartar";
import { FilaDeConferencia } from "./fila-conferencia";
import { FormularioLancamento } from "./formulario-lancamento";
import { ComparativoVisual, CustosPorMes, PostosVisual, RoscaDoMes } from "./graficos";

export const metadata: Metadata = { title: "Financeiro do contrato · Portal 3e" };

const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Abas da lista de lançamentos: filtro por situação, pela URL (funciona sem JS). */
const ABAS = [
  { chave: "todos", rotulo: "Todos" },
  { chave: "confirmado", rotulo: "Confirmados" },
  { chave: "em_conferencia", rotulo: "A conferir" },
  { chave: "descartado", rotulo: "Descartados" },
] as const;
type Aba = (typeof ABAS)[number]["chave"];
const ehAba = (v: string | undefined): v is Aba => ABAS.some((a) => a.chave === v);

export default paginaProtegida(
  { tipo: "interno", modulo: "financeiro", acao: "ver" },
  async function PaginaFinanceiroDoContrato({
    params,
    searchParams,
  }: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ mes?: string; situacao?: string }>;
  }) {
    const [{ id }, { mes, situacao }] = await Promise.all([params, searchParams]);
    if (!idValido(id)) notFound();
    const aba: Aba = ehAba(situacao) ? situacao : "todos";

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
    // Posto que a planilha cobra abaixo do próprio custo: aparece no topo, ao lado dos números.
    const abaixoDoCusto = painel?.porPosto.filter((p) => p.resultadoPrevisto < -0.005) ?? [];

    // Navegação entre meses: a lista vem do mais novo para o mais antigo.
    const indice = competencia ? detalhe.competencias.findIndex((c) => c.id === competencia.id) : -1;
    const mesAnterior = indice >= 0 ? detalhe.competencias[indice + 1] ?? null : null;
    const mesSeguinte = indice > 0 ? detalhe.competencias[indice - 1] : null;
    const hrefMes = (m: string, extra = "") => `${base}?mes=${m.slice(0, 7)}${extra}`;

    const visiveis = aba === "todos" ? lancamentos : lancamentos.filter((l) => l.status === aba);
    const contagem = (a: Aba) => (a === "todos" ? lancamentos.length : lancamentos.filter((l) => l.status === a).length);

    const custos = painel ? painel.linhas.slice(1) : [];
    const custoPrevisto = custos.reduce((s, l) => s + l.previsto, 0);
    const custoLancado = custos.reduce((s, l) => s + l.realizado, 0);

    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8 lg:py-8">
        <Link href="/admin/financeiro" className="text-sm text-texto-suave hover:text-acao hover:underline">
          Financeiro dos contratos
        </Link>
        <div className="mb-6 mt-1 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Contrato {contrato.numero} · {contrato.contratante}
            </h1>
            <p className="mt-1 text-sm text-texto-suave">
              {contrato.descricao ?? "O que a planilha prevê, o que foi lançado e o resultado de cada mês."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {podeCriar ? (
              <Link
                href={`/admin/financeiro/importar?contrato=${contrato.id}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-borda bg-fundo px-4 text-sm font-medium shadow-[var(--sombra-card)] hover:bg-fundo-hover"
              >
                <Upload aria-hidden strokeWidth={1.75} className="size-4" />
                {vigente ? "Nova versão da planilha" : "Importar planilha"}
              </Link>
            ) : null}
            {aberta && podeCriar ? (
              <a
                href="#novo-lancamento"
                className="inline-flex min-h-11 items-center gap-2 rounded-md bg-acao px-4 text-sm font-medium text-white shadow-[var(--sombra-card)] hover:bg-acao-hover"
              >
                <Plus aria-hidden strokeWidth={2} className="size-4" />
                Novo lançamento
              </a>
            ) : null}
          </div>
        </div>

        {detalhe.planilhas.length === 0 ? (
          <div className="superficie p-6">
            <p className="font-medium">Este contrato ainda não tem planilha de custo.</p>
            <p className="mt-1 text-sm text-texto-suave">
              Sem a planilha não há valor cobrado nem custo previsto para comparar com o que for lançado.
            </p>
          </div>
        ) : (
          <>
            {/* Mês na tela, com setas para os vizinhos */}
            <nav aria-label="Meses do contrato" className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                {competencia ? (
                  <>
                    <SetaDeMes href={mesAnterior ? hrefMes(mesAnterior.mes) : null} rotulo="Mês anterior" icone={ChevronLeft} />
                    <h2 className="min-w-44 text-center text-lg font-semibold" aria-current="page">
                      {maiuscula(mesPorExtenso(competencia.mes))}
                    </h2>
                    <SetaDeMes href={mesSeguinte ? hrefMes(mesSeguinte.mes) : null} rotulo="Mês seguinte" icone={ChevronRight} />
                    <BadgeStatus status={competencia.status} />
                    <span className="text-sm text-texto-suave">planilha versão {competencia.planilha_versao}</span>
                  </>
                ) : null}
                {podeCriar ? <AbrirCompetencia contratoId={contrato.id} sugestao={detalhe.mesSemCompetencia} /> : null}
              </div>
              {competencia && podeEditar ? (
                <AcoesDaCompetencia
                  competenciaId={competencia.id}
                  status={competencia.status}
                  mes={mesPorExtenso(competencia.mes)}
                  pendentes={emConferencia.length}
                />
              ) : null}
            </nav>

            {!competencia || !painel ? (
              <div className="superficie mb-6 p-6">
                <p className="font-medium">
                  {detalhe.mesSemCompetencia
                    ? `${maiuscula(mesPorExtenso(detalhe.mesSemCompetencia))} ainda não foi aberto.`
                    : "Nenhum mês aberto ainda."}
                </p>
                <p className="mt-1 text-sm text-texto-suave">
                  Abra o mês para começar a lançar notas, folha e despesas. O previsto do mês sai da planilha que
                  vale nele.
                </p>
              </div>
            ) : (
              <>
                {/* Números do mês */}
                <section
                  aria-label="Resumo do mês"
                  className={cn(
                    "mb-4 grid gap-4 sm:grid-cols-2",
                    abaixoDoCusto.length > 0 ? "lg:grid-cols-3 xl:grid-cols-5" : "lg:grid-cols-4",
                  )}
                >
                  <CartaoNumero
                    rotulo="Receita do mês"
                    valor={formatarReais(painel.linhas[0].realizado)}
                    icone={Receipt}
                    tom="verde"
                    nota={painel.semFaturamento ? "Nota do mês ainda não lançada" : `Previsto ${formatarReais(painel.linhas[0].previsto)}`}
                    notaAlerta={painel.semFaturamento}
                  />
                  <CartaoNumero
                    rotulo="Custos do mês"
                    valor={formatarReais(custoLancado)}
                    icone={Wallet}
                    tom="azul"
                    progresso={custoPrevisto > 0 ? custoLancado / custoPrevisto : null}
                    nota={`${custoPrevisto > 0 ? formatarPercentual(custoLancado / custoPrevisto) : "—"} de ${formatarReais(custoPrevisto)} previstos${painel.tributoEstimado ? " · tributo estimado" : ""}`}
                  />
                  <CartaoNumero
                    rotulo="Resultado"
                    valor={formatarReais(painel.resultado.realizado)}
                    icone={PiggyBank}
                    tom={!painel.semFaturamento && painel.resultado.realizado < 0 ? "vermelho" : "verde"}
                    corDoValor={
                      painel.semFaturamento ? undefined : painel.resultado.realizado < 0 ? "text-erro" : "text-sucesso"
                    }
                    nota={`Previsto ${formatarReais(painel.resultado.previsto)}`}
                  />
                  <CartaoNumero
                    rotulo="Margem"
                    valor={painel.semFaturamento ? "—" : formatarPercentual(painel.margem.realizada)}
                    icone={Percent}
                    tom="ambar"
                    nota={`Prevista ${formatarPercentual(painel.margem.prevista)}`}
                    notaAlerta={
                      !painel.semFaturamento &&
                      painel.margem.realizada !== null &&
                      painel.margem.prevista !== null &&
                      painel.margem.realizada < painel.margem.prevista
                    }
                  />
                  {abaixoDoCusto.length > 0 ? <PostosAbaixoDoCusto postos={abaixoDoCusto} /> : null}
                </section>

                {/* Gráficos do mês */}
                <div className="mb-4 grid gap-4 lg:grid-cols-5">
                  <div className="lg:col-span-3">
                    <CustosPorMes historico={detalhe.historico} mesAtual={competencia.mes} icone={BarChart3} />
                  </div>
                  <div className="lg:col-span-2">
                    <RoscaDoMes painel={painel} icone={PieChart} />
                  </div>
                </div>

                <div className="mb-4 grid gap-4 lg:grid-cols-5">
                  <div className="lg:col-span-2">
                    <PedeAtencao painel={painel} aConferirHref={hrefMes(competencia.mes, "&situacao=em_conferencia#lancamentos")} />
                  </div>
                  <div className="lg:col-span-3">
                    <ComparativoVisual painel={painel} icone={Layers} />
                  </div>
                </div>

                <div className="mb-6">
                  <PostosVisual painel={painel} icone={Users} />
                </div>

                {emConferencia.length > 0 ? (
                  <FilaDeConferencia itens={emConferencia} podeEditar={podeEditar && aberta} />
                ) : null}

                {aberta && podeCriar ? (
                  <div id="novo-lancamento" className="scroll-mt-6">
                    <FormularioLancamento
                      competenciaId={competencia.id}
                      postos={postos.map((p) => ({ id: p.id, nome: `${p.cargo} (${p.quantidade})` }))}
                    />
                  </div>
                ) : null}

                {/* Lançamentos do mês */}
                <section aria-labelledby="lancamentos-titulo" id="lancamentos" className="mb-6 scroll-mt-6">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h3 id="lancamentos-titulo" className="text-base font-semibold">
                      Lançamentos de {mesPorExtenso(competencia.mes)}
                    </h3>
                    <nav aria-label="Filtrar lançamentos" className="flex flex-wrap gap-1 rounded-lg bg-fundo-hover p-1">
                      {ABAS.map((a) => {
                        const atual = a.chave === aba;
                        const n = contagem(a.chave);
                        return (
                          <Link
                            key={a.chave}
                            href={hrefMes(competencia.mes, a.chave === "todos" ? "#lancamentos" : `&situacao=${a.chave}#lancamentos`)}
                            aria-current={atual ? "page" : undefined}
                            scroll={false}
                            className={cn(
                              "inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm",
                              atual ? "bg-fundo font-medium shadow-[var(--sombra-card)]" : "text-texto-suave hover:text-texto",
                            )}
                          >
                            {a.rotulo}
                            {a.chave !== "todos" && n > 0 ? <span className="text-xs text-texto-suave tabular-nums">{n}</span> : null}
                          </Link>
                        );
                      })}
                    </nav>
                  </div>
                  {visiveis.length === 0 ? (
                    <p className="superficie px-5 py-6 text-sm text-texto-suave">
                      {lancamentos.length === 0
                        ? "Nenhum lançamento ainda. Comece pela nota fiscal do mês e pela folha."
                        : "Nenhum lançamento nesta situação."}
                    </p>
                  ) : (
                    <ul className="superficie divide-y divide-borda">
                      {visiveis.map((l) => (
                        <LinhaDeLancamento
                          key={l.id}
                          lancamento={l}
                          podeDescartar={podeEditar && aberta && l.status === "confirmado"}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}

            {/* Base do contrato */}
            <section aria-labelledby="base" className="superficie overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-4 p-6 pb-4">
                <div>
                  <h2 id="base" className="text-sm font-medium">Base do contrato</h2>
                  {vigente ? (
                    <p className="mt-0.5 text-sm text-texto-suave">
                      {formatarReais(vigente.valor_mensal)} por mês
                      {vigente.regime_tributario ? ` · ${vigente.regime_tributario}` : ""}
                      {vigente.meses_execucao ? ` · ${vigente.meses_execucao} meses` : ""}
                    </p>
                  ) : null}
                </div>
                <IconeEmQuadro icone={FileText} tom="cinza" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <caption className="sr-only">Postos da planilha usada no mês</caption>
                  <thead className="bg-fundo-alt text-left text-texto-suave">
                    <tr>
                      <th scope="col" className="px-6 py-2.5 font-medium">Cargo</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Postos</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Cobrado por posto</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Total</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Salário base</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Custo por empregado</th>
                      <th scope="col" className="px-6 py-2.5 text-right font-medium">Lucro por posto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {postos.map((p) => (
                      <tr key={p.id} className="border-t border-borda">
                        <th scope="row" className="px-6 py-3 text-left font-medium">{p.cargo}</th>
                        <td className="px-4 py-3 text-right tabular-nums">{p.quantidade}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatarReais(p.valor_unitario)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatarReais(p.valor_total)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatarReais(p.salario_base)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatarReais(p.remuneracao + p.beneficios + p.insumos + p.encargos)}
                        </td>
                        <td className={cn("px-6 py-3 text-right tabular-nums", p.lucro < 0 && "text-erro")}>
                          {formatarReais(p.lucro)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="grid gap-1 border-t border-borda px-6 py-4 text-sm text-texto-suave">
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

function SetaDeMes({ href, rotulo, icone: Icone }: { href: string | null; rotulo: string; icone: LucideIcon }) {
  const classe = "inline-flex size-11 items-center justify-center rounded-md border border-borda bg-fundo shadow-[var(--sombra-card)]";
  if (!href) {
    return (
      <span aria-hidden className={cn(classe, "text-texto-suave opacity-50")}>
        <Icone strokeWidth={1.75} className="size-5" />
      </span>
    );
  }
  return (
    <Link href={href} aria-label={rotulo} className={cn(classe, "hover:bg-fundo-hover")}>
      <Icone aria-hidden strokeWidth={1.75} className="size-5" />
    </Link>
  );
}

/** Cartão de número do topo: rótulo, ícone no canto, valor grande e uma linha de contexto. */
function CartaoNumero({
  rotulo,
  valor,
  icone,
  tom,
  nota,
  notaAlerta,
  corDoValor,
  progresso,
}: {
  rotulo: string;
  valor: string;
  icone: LucideIcon;
  tom: Tom;
  nota: string;
  notaAlerta?: boolean;
  corDoValor?: string;
  /** Fração de 0 a 1 para a barrinha sob o valor (passa de 1 → barra cheia em alerta). */
  progresso?: number | null;
}) {
  return (
    <div className="superficie flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium">{rotulo}</p>
        <IconeEmQuadro icone={icone} tom={tom} />
      </div>
      <p className={cn("mt-2 text-[28px] font-semibold leading-tight tracking-tight tabular-nums", corDoValor)}>{valor}</p>
      {progresso !== undefined && progresso !== null ? (
        <div aria-hidden className="mt-3 h-1.5 overflow-hidden rounded-full bg-fundo-hover">
          <div
            className={cn("h-full rounded-full", progresso > 1 ? "bg-alerta" : "bg-acao")}
            style={{ width: `${Math.min(progresso, 1) * 100}%` }}
          />
        </div>
      ) : null}
      <p className={cn("mt-2 text-sm", notaAlerta ? "text-alerta" : "text-texto-suave")}>{nota}</p>
    </div>
  );
}

/**
 * Atenção da planilha: posto cujo valor cobrado não cobre o custo dele. É
 * dado da planilha, não do mês — aparece mesmo antes de qualquer lançamento.
 */
function PostosAbaixoDoCusto({ postos }: { postos: { id: string; cargo: string; resultadoPrevisto: number }[] }) {
  return (
    <div className="superficie flex flex-col border-alerta/50 p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-alerta">
          Atenção: {postos.length === 1 ? "posto cobrado" : "postos cobrados"} abaixo do custo
        </p>
        <IconeEmQuadro icone={TriangleAlert} tom="ambar" />
      </div>
      <ul className="mt-2 grid gap-1.5">
        {postos.map((p) => (
          <li key={p.id} className="text-sm">
            <span className="font-medium">{p.cargo}</span>
            <span className="block tabular-nums text-erro">{formatarReais(p.resultadoPrevisto)} por mês</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type ItemDeAtencao = { chave: string; icone: LucideIcon; tom: Tom; titulo: string; detalhe: string; href?: string };

/** O que pede ação neste mês, do mais urgente para o menos. Vazio = diz que está tudo em dia. */
function PedeAtencao({
  painel,
  aConferirHref,
}: {
  painel: Painel;
  aConferirHref: string;
}) {
  const itens: ItemDeAtencao[] = [];
  if (painel.aConferir.quantidade > 0) {
    itens.push({
      chave: "conferir",
      icone: ClipboardCheck,
      tom: "ambar",
      titulo: `${painel.aConferir.quantidade} ${painel.aConferir.quantidade === 1 ? "lançamento" : "lançamentos"} a conferir`,
      detalhe: `${formatarReais(painel.aConferir.valor)} que só entram nos números depois de conferidos`,
      href: aConferirHref,
    });
  }
  if (painel.semFaturamento) {
    itens.push({
      chave: "nota",
      icone: BadgeDollarSign,
      tom: "vermelho",
      titulo: "Nota do mês ainda não lançada",
      detalhe: "Sem ela, a receita e a margem do mês ficam zeradas",
    });
  }
  for (const l of painel.linhas) {
    if (l.grupo !== "receita" && l.diferenca > 0.005) {
      itens.push({
        chave: `acima-${l.grupo}`,
        icone: TriangleAlert,
        tom: "vermelho",
        titulo: `${ROTULOS_GRUPO[l.grupo]} acima do previsto`,
        detalhe: `${formatarReais(l.diferenca)} a mais que a planilha prevê`,
      });
    }
  }
  if (painel.tributoEstimado) {
    itens.push({
      chave: "tributo",
      icone: Receipt,
      tom: "cinza",
      titulo: "Tributo do mês estimado",
      detalhe: "Pela alíquota da planilha. Lance a guia para ver o número real",
    });
  }

  return (
    <section aria-labelledby="atencao" className="superficie grid h-full content-start gap-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 id="atencao" className="text-sm font-medium">Pede atenção</h3>
          <p className="mt-0.5 text-sm text-texto-suave">
            {itens.length === 0 ? "nada pendente neste mês" : `${itens.length} ${itens.length === 1 ? "item" : "itens"}`}
          </p>
        </div>
        <IconeEmQuadro icone={Bell} tom="ambar" />
      </div>
      {itens.length === 0 ? (
        <p className="flex items-center gap-3 rounded-md bg-acao-suave px-4 py-3 text-sm text-acao">
          <CheckCircle2 aria-hidden strokeWidth={1.75} className="size-5 shrink-0" />
          Tudo em dia: nada a conferir e nenhum grupo acima do previsto.
        </p>
      ) : (
        <ul className="grid gap-1">
          {itens.map((i) => {
            const conteudo = (
              <>
                <IconeEmQuadro icone={i.icone} tom={i.tom} tamanho="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{i.titulo}</span>
                  <span className="block text-sm text-texto-suave">{i.detalhe}</span>
                </span>
              </>
            );
            return (
              <li key={i.chave}>
                {i.href ? (
                  <Link href={i.href} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-fundo-hover">
                    {conteudo}
                    <ChevronRight aria-hidden strokeWidth={1.75} className="size-4 text-texto-suave" />
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 py-2.5">{conteudo}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Uma linha da lista de lançamentos: ícone pela natureza, descrição e situação, valor à direita. */
function LinhaDeLancamento({ lancamento: l, podeDescartar }: { lancamento: LancamentoDaTela; podeDescartar: boolean }) {
  const def = ehCategoria(l.categoria) ? CATEGORIAS[l.categoria] : null;
  const negativo = def?.sinal === -1 || l.natureza === "despesa";
  const descartado = l.status === "descartado";

  return (
    <li className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4", descartado && "text-texto-suave")}>
      <IconeEmQuadro icone={negativo ? ArrowUpRight : ArrowDownLeft} tom={descartado ? "cinza" : negativo ? "azul" : "verde"} tamanho="sm" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className={cn("font-medium", descartado && "line-through")}>{l.descricao}</span>
          <BadgeStatus status={l.status} />
        </p>
        <p className="mt-0.5 text-sm text-texto-suave">
          {def?.rotulo ?? l.categoria}
          {l.cargo ? ` · ${l.cargo}` : ""} · {dataBr(l.data_documento ?? l.criado_em)} ·{" "}
          {l.origem === "whatsapp" ? "WhatsApp" : "Portal"}
        </p>
        {l.motivo_descarte ? <p className="mt-0.5 text-sm">Descartado: {l.motivo_descarte}</p> : null}
        {l.anexos.map((a) => (
          <a
            key={a.id}
            href={`/api/financeiro/anexos/${a.id}`}
            target="_blank"
            rel="noopener"
            className="mt-1 inline-flex items-center gap-1 text-sm text-acao hover:underline"
          >
            <Paperclip aria-hidden strokeWidth={1.5} className="size-3.5" />
            {a.nome}
          </a>
        ))}
      </div>
      <p
        className={cn(
          "whitespace-nowrap text-base font-semibold tabular-nums",
          !descartado && (negativo ? "text-texto" : "text-sucesso"),
        )}
      >
        {negativo ? "− " : "+ "}
        {formatarReais(l.valor)}
      </p>
      {podeDescartar ? <BotaoDescartar lancamentoId={l.id} descricao={l.descricao} /> : <span className="hidden w-11 sm:block" />}
    </li>
  );
}
