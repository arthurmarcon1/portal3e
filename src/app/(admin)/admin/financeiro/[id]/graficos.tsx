import type { LucideIcon } from "lucide-react";

import { ROTULOS_GRUPO } from "@/features/financeiro/categorias";
import { formatarPercentual, formatarReais, type Painel } from "@/features/financeiro/painel";
import type { MesDoHistorico } from "@/features/financeiro/queries";
import { IconeEmQuadro, type Tom } from "@/components/icone-em-quadro";
import { cn } from "@/lib/utils";

/**
 * Os gráficos do financeiro do contrato. Nada aqui consulta o banco: tudo sai
 * de `calcularPainel` e do histórico do contrato.
 *
 * Regras de docs/04 que valem aqui: número escrito ao lado de toda marca (a
 * proporção é de relance, quem informa é o número), sem gradiente, sem
 * animação, e cor nunca sozinha — toda cor tem legenda. Cores de gráfico com
 * 3:1 sobre o branco: o "previsto" é um verde acinzentado (#6f9a80, 3,2:1).
 */

export const COR_PREVISTO = "#6f9a80";
export const COR_LANCADO = "#14532d";

/** Cabeçalho de card: título pequeno, subtítulo, ícone no canto — o desenho dos cartões do painel. */
export function CabecalhoDeCard({
  id,
  titulo,
  subtitulo,
  icone,
  tom,
  children,
}: {
  id: string;
  titulo: string;
  subtitulo?: string;
  icone?: LucideIcon;
  tom?: Tom;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 id={id} className="text-sm font-medium">
          {titulo}
        </h3>
        {subtitulo ? <p className="mt-0.5 text-sm text-texto-suave">{subtitulo}</p> : null}
        {children}
      </div>
      {icone && tom ? <IconeEmQuadro icone={icone} tom={tom} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------
// Barras por mês
// ---------------------------------------------------------------------

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesCurto = (iso: string) => MESES_CURTOS[Number(iso.slice(5, 7)) - 1];

/** Teto "redondo" do eixo: 1, 2, 2,5, 5 × 10ⁿ acima do maior valor. */
function tetoDoEixo(maior: number): number {
  if (maior <= 0) return 1000;
  const potencia = 10 ** Math.floor(Math.log10(maior));
  const passo = [1, 2, 2.5, 5, 10].find((m) => m * potencia >= maior) ?? 10;
  return passo * potencia;
}

/** "R$ 40 mil", "R$ 2,5 mil", "R$ 800". */
export function reaisCurtos(valor: number): string {
  if (Math.abs(valor) >= 1000) {
    return `R$ ${(valor / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  }
  return `R$ ${Math.round(valor).toLocaleString("pt-BR")}`;
}

/**
 * Custos por mês, previsto × lançado, em colunas agrupadas. Os meses à
 * frente mostram só o previsto da planilha que valerá neles.
 */
export function CustosPorMes({
  historico,
  mesAtual,
  icone,
}: {
  historico: MesDoHistorico[];
  mesAtual: string | null;
  icone: LucideIcon;
}) {
  const teto = tetoDoEixo(Math.max(...historico.flatMap((m) => [m.custoPrevisto, m.custoLancado])));
  const altura = (v: number) => `${Math.max((v / teto) * 100, v > 0 ? 1 : 0)}%`;

  return (
    <section aria-labelledby="custos-por-mes" className="superficie grid gap-5 p-6">
      <CabecalhoDeCard
        id="custos-por-mes"
        titulo="Custos por mês"
        subtitulo="previsto pela planilha × o que foi lançado de fato"
        icone={icone}
        tom="verde"
      >
        <ul className="mt-4 flex gap-5 text-sm text-texto-suave">
          <li className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-[2px]" style={{ backgroundColor: COR_PREVISTO }} />
            Previsto
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-[2px]" style={{ backgroundColor: COR_LANCADO }} />
            Lançado
          </li>
        </ul>
      </CabecalhoDeCard>

      {historico.length === 0 ? (
        <p className="py-10 text-center text-sm text-texto-suave">O gráfico aparece quando o primeiro mês for aberto.</p>
      ) : (
        <div className="grid grid-cols-[auto_1fr] gap-x-3">
          {/* eixo */}
          <div aria-hidden className="relative h-56 w-14 text-right text-xs text-texto-suave tabular-nums">
            {[1, 0.5, 0].map((f) => (
              <span key={f} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - f) * 100}%` }}>
                {f === 0 ? "0" : reaisCurtos(teto * f)}
              </span>
            ))}
          </div>
          <div className="relative h-56">
            {[0, 0.5, 1].map((f) => (
              <div
                key={f}
                aria-hidden
                className={cn("absolute inset-x-0 border-t", f === 1 ? "border-borda" : "border-dashed border-borda")}
                style={{ top: `${f * 100}%` }}
              />
            ))}
            <ul className="relative flex h-full items-end justify-around gap-2">
              {historico.map((m) => (
                <li key={m.mes} className="flex h-full flex-1 items-end justify-center gap-1">
                  <span className="sr-only">
                    {mesCurto(m.mes)}: previsto {formatarReais(m.custoPrevisto)}
                    {m.futuro ? ", mês ainda não aberto" : `, lançado ${formatarReais(m.custoLancado)}`}
                  </span>
                  <span
                    aria-hidden
                    className="w-full max-w-7 rounded-t-[3px]"
                    style={{ height: altura(m.custoPrevisto), backgroundColor: COR_PREVISTO }}
                  />
                  {m.futuro ? (
                    <span aria-hidden className="w-full max-w-7" />
                  ) : (
                    <span
                      aria-hidden
                      className="w-full max-w-7 rounded-t-[3px]"
                      style={{ height: altura(m.custoLancado), backgroundColor: COR_LANCADO }}
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>
          <span />
          <ul aria-hidden className="mt-2 flex justify-around gap-2 text-xs text-texto-suave">
            {historico.map((m) => (
              <li key={m.mes} className={cn("flex-1 text-center", m.mes === mesAtual && "font-semibold text-texto")}>
                {mesCurto(m.mes)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------
// Rosca do mês
// ---------------------------------------------------------------------

/** Cor de cada parte da receita. Tons escuros, com contraste sobre o branco. */
const CORES_COMPOSICAO = {
  pessoal: "#1e3a8a",
  insumos: "#155e75",
  operacao: "#5b21b6",
  tributos: "#b45309",
  resultado: "#15803d",
} as const;

type Parte = { chave: keyof typeof CORES_COMPOSICAO; rotulo: string; valor: number };

function partes(painel: Painel, campo: "previsto" | "realizado"): Parte[] {
  const custo = (g: "pessoal" | "insumos" | "operacao" | "tributos") =>
    painel.linhas.find((l) => l.grupo === g)?.[campo] ?? 0;
  return [
    { chave: "pessoal", rotulo: ROTULOS_GRUPO.pessoal, valor: custo("pessoal") },
    { chave: "insumos", rotulo: ROTULOS_GRUPO.insumos, valor: custo("insumos") },
    { chave: "operacao", rotulo: ROTULOS_GRUPO.operacao, valor: custo("operacao") },
    { chave: "tributos", rotulo: ROTULOS_GRUPO.tributos, valor: custo("tributos") },
    { chave: "resultado", rotulo: "Resultado", valor: painel.resultado[campo] },
  ];
}

const RAIO = 44;
const ESPESSURA = 20;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;
/** Folga entre fatias, em unidades do SVG — separa as cores sem depender delas. */
const FOLGA = 1.5;

/**
 * Para onde vai a receita do mês: o lançado, se a nota já entrou; senão o
 * previsto da planilha, dizendo que é previsto. Se o custo passou da receita,
 * a rosca é medida pelo custo e o resultado (negativo) aparece escrito.
 */
export function RoscaDoMes({ painel, icone }: { painel: Painel; icone: LucideIcon }) {
  const campo = painel.semFaturamento ? "previsto" : "realizado";
  const itens = partes(painel, campo);
  const receita = painel.linhas[0][campo];
  const custos = itens.filter((p) => p.chave !== "resultado").reduce((s, p) => s + p.valor, 0);
  const base = Math.max(receita, custos, 1);
  const margem = campo === "previsto" ? painel.margem.prevista : painel.margem.realizada;
  const margemPrevista = painel.margem.prevista;

  const fatias = itens
    .filter((p) => p.valor > 0)
    .reduce<Array<Parte & { comprimento: number; inicio: number }>>((lista, p) => {
      const anterior = lista.at(-1);
      const inicio = anterior ? anterior.inicio + anterior.comprimento : 0;
      return [...lista, { ...p, comprimento: (p.valor / base) * CIRCUNFERENCIA, inicio }];
    }, []);

  return (
    <section aria-labelledby="rosca-do-mes" className="superficie grid content-start gap-5 p-6">
      <CabecalhoDeCard
        id="rosca-do-mes"
        titulo="Para onde vai a receita"
        subtitulo={campo === "previsto" ? "previsto pela planilha — a nota do mês ainda não entrou" : "lançado no mês"}
        icone={icone}
        tom="azul"
      />

      <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
        <div className="relative mx-auto size-44 shrink-0 sm:mx-0">
          <svg
            viewBox="0 0 120 120"
            role="img"
            aria-label={`Receita de ${formatarReais(receita)}: ${itens.map((p) => `${p.rotulo} ${formatarReais(p.valor)}`).join(", ")}`}
            className="size-full -rotate-90"
          >
            <circle cx="60" cy="60" r={RAIO} fill="none" stroke="var(--fundo-alt)" strokeWidth={ESPESSURA} />
            {fatias.map((f) => (
              <circle
                key={f.chave}
                cx="60"
                cy="60"
                r={RAIO}
                fill="none"
                stroke={CORES_COMPOSICAO[f.chave]}
                strokeWidth={ESPESSURA}
                strokeDasharray={`${Math.max(f.comprimento - FOLGA, 0.5)} ${CIRCUNFERENCIA}`}
                strokeDashoffset={-f.inicio}
              />
            ))}
          </svg>
          <div aria-hidden className="absolute inset-0 grid place-content-center text-center">
            <span className="text-lg font-semibold tabular-nums">{reaisCurtos(receita)}</span>
            <span className="text-xs text-texto-suave">receita do mês</span>
          </div>
        </div>

        <ul className="grid min-w-52 flex-1 gap-2.5 text-sm">
          {itens.map((p) => (
            <li key={p.chave} className="flex items-center gap-2.5">
              <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: CORES_COMPOSICAO[p.chave] }} />
              <span className="min-w-0 flex-1 truncate text-texto-suave">{p.rotulo}</span>
              <span className={cn("font-semibold tabular-nums", p.valor < 0 && "text-erro")}>{formatarReais(p.valor)}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="border-t border-borda pt-4 text-sm text-texto-suave">
        <span className={cn("font-semibold", margem !== null && margem < 0 ? "text-erro" : "text-sucesso")}>
          {formatarPercentual(margem)}
        </span>{" "}
        de margem
        {campo === "realizado" ? ` · prevista ${formatarPercentual(margemPrevista)}` : ""}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------
// Barras de previsto × lançado (por grupo e por posto)
// ---------------------------------------------------------------------

type Comparacao = {
  chave: string;
  rotulo: string;
  previsto: number;
  realizado: number;
  /** Lançado acima do previsto é ruim (custo); abaixo é ruim (receita). */
  ruim: boolean;
  /** Linha miúda sob o rótulo: de onde vem o previsto, o que falta conferir. */
  nota?: string;
};

/** Barra à esquerda, colunas de previsto e lançado à direita (a partir de `sm`). */
const COLUNAS_AO_LADO = "sm:grid-cols-[minmax(0,1fr)_8rem_8rem]";

function LegendaPrevistoLancado() {
  return (
    <ul className="mt-4 flex flex-wrap gap-5 text-sm text-texto-suave">
      <li className="flex items-center gap-2">
        <span aria-hidden className="size-2.5 rounded-[2px]" style={{ backgroundColor: COR_PREVISTO }} />
        Previsto
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden className="size-2.5 rounded-[2px]" style={{ backgroundColor: COR_LANCADO }} />
        Lançado
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden className="size-2.5 rounded-[2px] bg-alerta" />
        Fora do previsto
      </li>
    </ul>
  );
}

/** Duas barras por linha — previsto e lançado — na mesma escala. */
function BarrasComparadas({
  id,
  titulo,
  descricao,
  itens,
  icone,
  tom,
  numerosAoLado = false,
}: {
  id: string;
  titulo: string;
  descricao: string;
  itens: Comparacao[];
  icone: LucideIcon;
  tom: Tom;
  /** Previsto e lançado em colunas à direita da barra, no lugar de uma tabela à parte. */
  numerosAoLado?: boolean;
}) {
  const escala = Math.max(1, ...itens.flatMap((i) => [i.previsto, i.realizado]));

  return (
    <section aria-labelledby={id} className="superficie grid content-start gap-5 p-6">
      <CabecalhoDeCard id={id} titulo={titulo} subtitulo={descricao} icone={icone} tom={tom}>
        <LegendaPrevistoLancado />
      </CabecalhoDeCard>

      {numerosAoLado ? (
        <div aria-hidden className={cn("-mb-3 hidden text-xs text-texto-suave sm:grid", COLUNAS_AO_LADO)}>
          <span />
          <span className="text-right">Previsto</span>
          <span className="text-right">Lançado</span>
        </div>
      ) : null}
      <ul className="grid gap-4">
        {itens.map((i) => {
          const proporcao = i.previsto > 0 ? i.realizado / i.previsto : null;
          const barras = (
            <>
              <div aria-hidden className="grid gap-1">
                <div className="h-2 rounded-full" style={{ width: `${(i.previsto / escala) * 100}%`, backgroundColor: COR_PREVISTO }} />
                <div
                  className={cn("h-2 rounded-full", i.ruim && "bg-alerta")}
                  style={{
                    width: `${Math.max((i.realizado / escala) * 100, i.realizado > 0 ? 0.5 : 0)}%`,
                    backgroundColor: i.ruim ? undefined : COR_LANCADO,
                  }}
                />
              </div>
              {i.ruim ? (
                <span className="text-xs text-alerta">
                  {i.realizado > i.previsto ? "Acima do previsto" : "Abaixo do previsto"} em{" "}
                  {formatarReais(Math.abs(i.realizado - i.previsto))}
                </span>
              ) : null}
            </>
          );

          if (numerosAoLado) {
            return (
              <li key={i.chave} className={cn("grid gap-x-4 gap-y-1.5 sm:items-center", COLUNAS_AO_LADO)}>
                <div className="grid min-w-0 gap-1.5">
                  <span className="text-sm font-medium">{i.rotulo}</span>
                  {barras}
                </div>
                <div className="flex justify-between gap-4 text-sm tabular-nums sm:contents">
                  <p className="sm:text-right">
                    <span className="text-texto-suave sm:sr-only">Previsto </span>
                    {formatarReais(i.previsto)}
                  </p>
                  <p className="text-right font-semibold">
                    <span className="font-normal text-texto-suave sm:sr-only">Lançado </span>
                    {formatarReais(i.realizado)}
                    {proporcao !== null ? (
                      <span className="block text-xs font-normal text-texto-suave">{formatarPercentual(proporcao)} do previsto</span>
                    ) : null}
                  </p>
                </div>
              </li>
            );
          }

          return (
            <li key={i.chave} className="grid gap-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm font-medium">
                  {i.rotulo}
                  {i.nota ? <span className="block text-xs font-normal text-texto-suave">{i.nota}</span> : null}
                </span>
                <span className="text-sm tabular-nums">
                  <span className="font-semibold">{formatarReais(i.realizado)}</span>
                  <span className="text-texto-suave">
                    {" "}de {formatarReais(i.previsto)}
                    {proporcao !== null ? ` · ${formatarPercentual(proporcao)}` : ""}
                  </span>
                </span>
              </div>
              {barras}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Previsto × lançado por grupo, em barras. */
export function ComparativoVisual({ painel, icone }: { painel: Painel; icone: LucideIcon }) {
  return (
    <BarrasComparadas
      id="comparativo-visual"
      titulo="Previsto × lançado por grupo"
      descricao="o que a planilha prevê no mês contra o que já foi lançado e conferido"
      icone={icone}
      tom="roxo"
      itens={painel.linhas.map((l) => ({
        chave: l.grupo,
        rotulo: ROTULOS_GRUPO[l.grupo],
        // O que só a antiga tabela dizia: origem do previsto e o que falta conferir.
        nota:
          [
            l.grupo === "operacao" ? "previsto: custos indiretos da planilha" : null,
            l.grupo === "tributos" && painel.tributoEstimado ? "lançado estimado pela alíquota da planilha" : null,
            l.aConferir ? `${formatarReais(l.aConferir)} a conferir` : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined,
        previsto: l.previsto,
        realizado: l.realizado,
        // Receita só é "ruim" depois que a nota entrou; antes, é só falta de lançamento.
        ruim:
          l.grupo === "receita"
            ? !painel.semFaturamento && l.realizado < l.previsto - 0.005
            : l.realizado > l.previsto + 0.005,
      }))}
    />
  );
}

/** Pessoal por posto, em barras. */
export function PostosVisual({ painel, icone }: { painel: Painel; icone: LucideIcon }) {
  if (painel.porPosto.length === 0) return null;
  return (
    <BarrasComparadas
      id="postos-visual"
      titulo="Pessoal por posto"
      descricao="Salário, benefícios e encargos previstos para cada cargo, contra o lançado com o posto informado. Férias e afastamento costumam baixar o custo do mês."
      icone={icone}
      tom="azul"
      numerosAoLado
      itens={painel.porPosto.map((p) => ({
        chave: p.id,
        rotulo: `${p.cargo} (${p.quantidade})`,
        previsto: p.pessoalPrevisto,
        realizado: p.pessoalRealizado,
        ruim: p.pessoalRealizado > p.pessoalPrevisto + 0.005,
      }))}
    />
  );
}
