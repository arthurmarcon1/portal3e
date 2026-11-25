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

/** Uma faixa empilhada: cada parte em proporção da receita. */
function Faixa({ titulo, receita, itens }: { titulo: string; receita: number; itens: Parte[] }) {
  const custos = itens.filter((p) => p.chave !== "resultado").reduce((s, p) => s + p.valor, 0);
  // Se o custo passou da receita, a faixa é medida pelo custo, e o resultado
  // (negativo) não ocupa espaço — ele aparece escrito, em vermelho.
  const base = Math.max(receita, custos, 1);
  const visiveis = itens.filter((p) => p.valor > 0);

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{titulo}</p>
        <p className="text-sm text-texto-suave tabular-nums">Receita {formatarReais(receita)}</p>
      </div>
      <div
        role="img"
        aria-label={`${titulo}: ${itens.map((p) => `${p.rotulo} ${formatarReais(p.valor)}`).join(", ")}`}
        className="flex h-6 w-full overflow-hidden rounded-sm border border-borda bg-fundo-alt"
      >
        {visiveis.map((p) => (
          <div
            key={p.chave}
            className="h-full border-r-2 border-fundo last:border-r-0"
            style={{ width: `${(p.valor / base) * 100}%`, backgroundColor: CORES_COMPOSICAO[p.chave] }}
          />
        ))}
      </div>
      <ul className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {itens.map((p) => (
          <li key={p.chave} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-3 shrink-0 rounded-[2px]"
              style={{ backgroundColor: CORES_COMPOSICAO[p.chave] }}
            />
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
          Cada faixa é a receita do mês dividida entre os custos e o que sobra de resultado.
        </p>
      </div>
      <Faixa titulo="Previsto pela planilha" receita={receita.previsto} itens={partes(painel, "previsto")} />
      {painel.semFaturamento ? (
        <p className="text-sm text-texto-suave">
          A faixa do mês aparece quando a nota do mês for lançada.
        </p>
      ) : (
        <Faixa titulo="Lançado no mês" receita={receita.realizado} itens={partes(painel, "realizado")} />
      )}
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
};

/** Duas barras por linha — previsto e lançado — na mesma escala. */
function BarrasComparadas({
  id,
  titulo,
  descricao,
  itens,
}: {
  id: string;
  titulo: string;
  descricao: string;
  itens: Comparacao[];
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

      <ul className="grid gap-4">
        {itens.map((i) => {
          const proporcao = i.previsto > 0 ? i.realizado / i.previsto : null;
          return (
            <li key={i.chave} className="grid gap-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm font-medium">{i.rotulo}</span>
                <span className="text-sm text-texto-suave tabular-nums">
                  {formatarReais(i.realizado)} de {formatarReais(i.previsto)}
                  {proporcao !== null ? ` · ${formatarPercentual(proporcao)}` : ""}
                </span>
              </div>
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
      descricao="Salário, benefícios e encargos previstos para cada cargo, contra o lançado com o posto informado."
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
