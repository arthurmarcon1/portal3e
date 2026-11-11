"use client";

import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import { CampoSelecao } from "@/components/campo-selecao";
import { CampoTexto } from "@/components/campo-texto";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { importarPlanilha, previsualizarPlanilha } from "@/features/financeiro/actions";
import { formatarReais } from "@/features/financeiro/painel";
import { previstoDosPostos, type PlanilhaLida } from "@/features/financeiro/planilha-de-custo";

export function TelaImportacao({
  contratos,
  contratoInicial,
}: {
  contratos: { id: string; nome: string }[];
  contratoInicial?: string;
}) {
  const router = useRouter();
  const idArquivo = useId();
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [contrato, setContrato] = useState<string | undefined>(contratoInicial);
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [observacao, setObservacao] = useState("");
  const [previa, setPrevia] = useState<PlanilhaLida | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState<"lendo" | "gravando" | null>(null);

  function formulario(): FormData | null {
    const arquivo = arquivoRef.current?.files?.[0];
    if (!arquivo) {
      setErro("Escolha o arquivo da planilha (.xlsx).");
      return null;
    }
    const f = new FormData();
    f.set("arquivo", arquivo);
    f.set("contrato_id", contrato ?? "");
    f.set("vigente_desde", mes);
    f.set("observacao", observacao);
    return f;
  }

  async function ler() {
    setErro(null);
    setPrevia(null);
    const f = formulario();
    if (!f) return;
    setProcessando("lendo");
    const r = await previsualizarPlanilha(f);
    setProcessando(null);
    if (r.ok) setPrevia(r.dados);
    else setErro(r.erro);
  }

  async function gravar() {
    if (!contrato) {
      setErro("Escolha o contrato que recebe a planilha.");
      return;
    }
    const f = formulario();
    if (!f) return;
    setProcessando("gravando");
    const r = await importarPlanilha(f);
    setProcessando(null);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    toast.success(`Planilha gravada como versão ${r.dados.versao} do contrato.`);
    router.push(`/admin/financeiro/${r.dados.contratoId}`);
  }

  const previsto = previa ? previstoDosPostos(previa.postos) : null;

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 rounded-lg border border-borda bg-fundo p-5 sm:grid-cols-2">
        <CampoSelecao
          rotulo="Contrato"
          opcoes={contratos}
          valor={contrato}
          aoMudar={setContrato}
          placeholder="Escolha o contrato"
        />
        <CampoTexto
          rotulo="Vale a partir de"
          type="month"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          dica="O primeiro mês em que estes valores são cobrados."
        />
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={idArquivo}>Arquivo da planilha (.xlsx)</Label>
          <p className="text-sm text-texto-suave">
            Arquivo .xls antigo? Abra no Excel ou no WPS, use Salvar como e escolha .xlsx.
          </p>
          <input
            id={idArquivo}
            ref={arquivoRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={() => setPrevia(null)}
            className="min-h-11 rounded-md border border-borda-campo px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-fundo-alt file:px-3 file:py-1.5 file:text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <CampoTexto
            rotulo="Observação (opcional)"
            value={observacao}
            maxLength={400}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex.: proposta vencedora do pregão, repactuação 2027"
          />
        </div>
        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <Button type="button" variant="outline" className="min-h-11 px-4" onClick={ler} disabled={processando !== null}>
            {processando === "lendo" ? "Lendo a planilha…" : "Ler a planilha"}
          </Button>
        </div>
        <p aria-live="polite" className="text-sm text-erro sm:col-span-2">
          {erro}
        </p>
      </section>

      {previa && previsto ? (
        <section aria-labelledby="previa" className="grid gap-4 rounded-lg border border-borda bg-fundo p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="previa" className="text-base font-semibold">O que vai ser gravado</h2>
              <p className="text-sm text-texto-suave">
                {previa.postos.reduce((s, p) => s + p.quantidade, 0)} postos em {previa.postos.length} cargos
                {previa.regime_tributario ? ` · ${previa.regime_tributario}` : ""}
                {previa.meses_execucao ? ` · ${previa.meses_execucao} meses de execução` : ""}
              </p>
            </div>
            <p className="text-right">
              <span className="block text-sm text-texto-suave">Cobrado por mês</span>
              <span className="text-xl font-semibold tabular-nums">{formatarReais(previa.valor_mensal)}</span>
            </p>
          </div>

          {previa.avisos.length > 0 ? (
            <div role="status" className="rounded-md border border-alerta/40 bg-fundo p-4">
              <p className="flex items-center gap-2 font-medium text-alerta">
                <AlertTriangle aria-hidden strokeWidth={1.5} className="size-4" />
                {previa.avisos.length === 1 ? "1 ponto para conferir" : `${previa.avisos.length} pontos para conferir`}
              </p>
              <ul className="mt-2 grid list-disc gap-1 pl-5 text-sm">
                {previa.avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-texto-suave">
                Dá para gravar assim; os valores entram como estão na planilha.
              </p>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">Cargos da planilha</caption>
              <thead className="bg-fundo-alt text-left text-texto-suave">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Cargo</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Postos</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Valor por posto</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Total</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Salário base</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Custo por empregado</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Lucro por posto</th>
                </tr>
              </thead>
              <tbody>
                {previa.postos.map((p) => (
                  <tr key={p.cargo} className="border-t border-borda">
                    <td className="px-3 py-2.5">
                      {p.cargo}
                      {p.aba ? null : <span className="block text-alerta">sem aba de composição</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.quantidade}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatarReais(p.valor_unitario)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatarReais(p.valor_total)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatarReais(p.composicao.salario_base)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatarReais(p.composicao.remuneracao + p.composicao.beneficios + p.composicao.insumos + p.composicao.encargos)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatarReais(p.composicao.lucro)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-4">
            {[
              ["Pessoal previsto", previsto.pessoal],
              ["Insumos previstos", previsto.insumos],
              ["Tributos previstos", previsto.tributos],
              ["Lucro previsto", previsto.lucro],
            ].map(([rotulo, valor]) => (
              <div key={rotulo as string} className="rounded-md bg-fundo-alt px-3 py-2">
                <dt className="text-texto-suave">{rotulo}</dt>
                <dd className="font-medium tabular-nums">{formatarReais(valor as number)}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" className="min-h-11 px-4" onClick={gravar} disabled={processando !== null || !contrato}>
              {processando === "gravando" ? "Gravando…" : "Gravar como base do contrato"}
            </Button>
            {!contrato ? <span className="text-sm text-texto-suave">Escolha o contrato para gravar.</span> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
