import { ROTULOS_GRUPO } from "@/features/financeiro/categorias";
import { formatarPercentual, formatarReais, type Painel } from "@/features/financeiro/painel";
import { cn } from "@/lib/utils";

/**
 * O painel do mês em barras — os mesmos números das tabelas, para ler de
 * relance. Nada aqui consulta o banco: tudo sai de `calcularPainel`.
 *
 * Regras de docs/04 que valem aqui: barra sóbria mais número (a proporção é de
 * relance, quem informa é o número escrito ao lado), sem gradiente, sem
 * animação, e cor nunca sozinha — toda cor tem legenda com o nome e o valor.
 */

/** Cor de cada parte da receita. Tons escuros, com contraste para a faixa e a legenda. */
const CORES_COMPOSICAO = {
  pessoal: "#1e3a8a",
  insumos: "#155e75",
  operacao: "#5b21b6",
  tributos: "#713f12",
  resultado: "#14532d",
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

const RAIO = 46;
const ESPESSURA = 18;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;
/** Folga entre fatias, em unidades do SVG — separa as cores sem depender delas. */
const FOLGA = 1.2;

/**
 * Rosca: cada fatia é uma parte da receita. No centro, a margem — o que sobra
 * de cada R$ 100. Se o custo passou da receita, a rosca é medida pelo custo e
 * o resultado (negativo) não vira fatia: aparece escrito, em vermelho.
 */
function Rosca({ titulo, receita, itens }: { titulo: string; receita: number; itens: Parte[] }) {
  const custos = itens.filter((p) => p.chave !== "resultado").reduce((s, p) => s + p.valor, 0);
  const base = Math.max(receita, custos, 1);
  const resultado = itens.find((p) => p.chave === "resultado")?.valor ?? 0;
  const margem = receita > 0 ? resultado / receita : null;

  // Cada fatia começa onde a anterior terminou.
  const fatias = itens
    .filter((p) => p.valor > 0)
    .reduce<Array<Parte & { comprimento: number; inicio: number }>>((lista, p) => {
      const anterior = lista.at(-1);
      const inicio = anterior ? anterior.inicio + anterior.comprimento : 0;
      return [...lista, { ...p, comprimento: (p.valor / base) * CIRCUNFERENCIA, inicio }];
    }, []);

  return (
    <div className="grid content-start gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{titulo}</p>
        <p className="text-sm text-texto-suave tabular-nums">Receita {formatarReais(receita)}</p>
      </div>

      <div className="relative mx-auto size-44">
        <svg
          viewBox="0 0 120 120"
          role="img"
          aria-label={`${titulo}: ${itens.map((p) => `${p.rotulo} ${formatarReais(p.valor)}`).join(", ")}`}
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
          <span className={cn("text-xl font-semibold tabular-nums", resultado < 0 && "text-erro")}>
            {formatarPercentual(margem)}
          </span>
          <span className="text-xs text-texto-suave">de margem</span>
        </div>
      </div>

      <ul className="grid gap-1.5 text-sm">
        {itens.map((p) => (
          <li key={p.chave} className="flex items-center gap-2">
            <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: CORES_COMPOSICAO[p.chave] }} />
            <span className="min-w-0 flex-1 truncate">{p.rotulo}</span>
            <span className={cn("tabular-nums", p.valor < 0 ? "text-erro" : "text-texto-suave")}>
              {formatarReais(p.valor)}
              {receita > 0 ? ` · ${formatarPercentual(p.valor / receita)}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Para onde vai a receita: o previsto da planilha e, com a nota lançada, o mês real. */
export function ComposicaoDaReceita({ painel }: { painel: Painel }) {
  const receita = painel.linhas.find((l) => l.grupo === "receita");
  if (!receita) return null;

  return (
    <section aria-labelledby="composicao" className="superficie grid gap-5 p-5">
      <div>
        <h3 id="composicao" className="text-base font-semibold">
          Para onde vai a receita
        </h3>
        <p className="mt-1 text-sm text-texto-suave">
          A receita do mês dividida entre os custos e o que sobra de resultado. No centro, a margem.
        </p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <Rosca titulo="Previsto pela planilha" receita={receita.previsto} itens={partes(painel, "previsto")} />
        {painel.semFaturamento ? (
          <p className="self-center text-center text-sm text-texto-suave">
            A rosca do mês aparece quando a nota do mês for lançada.
          </p>
        ) : (
          <Rosca titulo="Lançado no mês" receita={receita.realizado} itens={partes(painel, "realizado")} />
        )}
      </div>
    </section>
  );
}

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

/** Duas barras por linha — previsto e lançado — na mesma escala. */
function BarrasComparadas({
  id,
  titulo,
  descricao,
  itens,
  numerosAoLado = false,
}: {
  id: string;
  titulo: string;
  descricao: string;
  itens: Comparacao[];
  /** Previsto e lançado em colunas à direita da barra, no lugar de uma tabela à parte. */
  numerosAoLado?: boolean;
}) {
  const escala = Math.max(1, ...itens.flatMap((i) => [i.previsto, i.realizado]));

  return (
    <section aria-labelledby={id} className="superficie grid gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={id} className="text-base font-semibold">
            {titulo}
          </h3>
          <p className="mt-1 text-sm text-texto-suave">{descricao}</p>
        </div>
        <ul className="flex gap-4 text-xs text-texto-suave">
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-4 rounded-[2px] bg-[#8a939d]" />
            Previsto
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-4 rounded-[2px] bg-acao" />
            Lançado
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-4 rounded-[2px] bg-alerta" />
            Fora do previsto
          </li>
        </ul>
      </div>

      {numerosAoLado ? (
        <div aria-hidden className={cn("-mb-2 hidden text-xs text-texto-suave sm:grid", COLUNAS_AO_LADO)}>
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
                <div className="h-2 rounded-[2px] bg-[#8a939d]" style={{ width: `${(i.previsto / escala) * 100}%` }} />
                <div
                  className={cn("h-2 rounded-[2px]", i.ruim ? "bg-alerta" : "bg-acao")}
                  style={{ width: `${Math.max((i.realizado / escala) * 100, i.realizado > 0 ? 0.5 : 0)}%` }}
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
                  <p className="text-right">
                    <span className="text-texto-suave sm:sr-only">Lançado </span>
                    {formatarReais(i.realizado)}
                    {proporcao !== null ? (
                      <span className="block text-xs text-texto-suave">{formatarPercentual(proporcao)} do previsto</span>
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
                <span className="text-sm text-texto-suave tabular-nums">
                  {formatarReais(i.realizado)} de {formatarReais(i.previsto)}
                  {proporcao !== null ? ` · ${formatarPercentual(proporcao)}` : ""}
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
export function ComparativoVisual({ painel }: { painel: Painel }) {
  return (
    <BarrasComparadas
      id="comparativo-visual"
      titulo="Previsto × lançado"
      descricao="A barra cinza é o que a planilha prevê no mês; a verde, o que já foi lançado e conferido."
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
export function PostosVisual({ painel }: { painel: Painel }) {
  if (painel.porPosto.length === 0) return null;
  return (
    <BarrasComparadas
      id="postos-visual"
      titulo="Pessoal por posto"
      descricao="Salário, benefícios e encargos previstos para cada cargo, contra o lançado com o posto informado. Só entra aqui o lançamento de pessoal que indicou o posto; férias e afastamento costumam baixar o custo do mês."
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
