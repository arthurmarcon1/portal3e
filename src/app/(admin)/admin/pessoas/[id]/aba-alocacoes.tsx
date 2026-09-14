"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DialogoConfirmacao } from "@/components/dialogo-confirmacao";
import { Button } from "@/components/ui/button";
import { encerrarAlocacao } from "@/features/pessoas/actions";
import type { Alocacao, ContratoComUnidades } from "@/features/pessoas/queries";

import { FormularioAlocacao } from "./formulario-alocacao";

/**
 * Histórico de alocações, do mais recente para o mais antigo (F1.2).
 *
 * Encerrar pede a data de fim e **não apaga a linha**: o período em que a
 * pessoa esteve naquele posto é o que sustenta espelho, ciência e o que o
 * contratante enxergou na época (invariante 8).
 */

const SITUACAO: Record<string, { rotulo: string; classe: string }> = {
  ativa: { rotulo: "Ativa", classe: "border-sucesso/30 text-sucesso" },
  ferias: { rotulo: "Em férias", classe: "border-alerta/30 text-alerta" },
  afastado: { rotulo: "Afastado", classe: "border-alerta/30 text-alerta" },
  encerrada: { rotulo: "Encerrada", classe: "border-borda text-texto-suave" },
};

function dataBr(iso: string | null): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Hoje em ISO, na data local — é o que o campo `date` do formulário usa. */
function hojeIso(): string {
  const agora = new Date();
  const mes = `${agora.getMonth() + 1}`.padStart(2, "0");
  const dia = `${agora.getDate()}`.padStart(2, "0");
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

export function AbaAlocacoes({
  pessoaId,
  alocacoes,
  contratos,
  podeCriar,
  podeEditar,
}: {
  pessoaId: string;
  alocacoes: Alocacao[];
  contratos: ContratoComUnidades[];
  podeCriar: boolean;
  podeEditar: boolean;
}) {
  const [criando, setCriando] = useState(false);
  const [paraEncerrar, setParaEncerrar] = useState<Alocacao | null>(null);
  const [dataFim, setDataFim] = useState(hojeIso());

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-texto-suave">
          {alocacoes.length === 0
            ? "Nenhuma alocação registrada."
            : "Da mais recente para a mais antiga. Nada é apagado: encerrar preenche a data de saída."}
        </p>
        {podeCriar ? (
          <Button type="button" onClick={() => setCriando(true)}>
            <Plus aria-hidden strokeWidth={1.5} />
            Nova alocação
          </Button>
        ) : null}
      </div>

      {alocacoes.length === 0 ? (
        <div className="rounded-lg border border-borda bg-fundo-alt px-4 py-10 text-center">
          <p className="font-medium">Esta pessoa ainda não foi alocada.</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-texto-suave">
            A alocação liga a pessoa a um contrato, uma unidade e uma função. É por ela
            que o contratante enxerga o quadro dele.
          </p>
        </div>
      ) : (
        <ol className="grid gap-px overflow-hidden rounded-lg border border-borda bg-borda">
          {alocacoes.map((a) => {
            const situacao = SITUACAO[a.status] ?? {
              rotulo: a.status,
              classe: "border-borda text-texto-suave",
            };
            return (
              <li
                key={a.id}
                className="flex flex-wrap items-start justify-between gap-3 bg-fundo px-4 py-3"
              >
                <div>
                  <p className="font-medium">{a.funcao}</p>
                  <p className="text-sm text-texto-suave">
                    Contrato {a.contrato_numero} · {a.unidade_nome}
                  </p>
                  <p className="mt-0.5 text-sm text-texto-suave tabular-nums">
                    {dataBr(a.data_inicio)} a {a.data_fim ? dataBr(a.data_fim) : "hoje"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-sm border bg-fundo px-1.5 py-0.5 text-xs ${situacao.classe}`}
                  >
                    {situacao.rotulo}
                  </span>
                  {podeEditar && a.status !== "encerrada" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDataFim(hojeIso());
                        setParaEncerrar(a);
                      }}
                    >
                      Encerrar
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <FormularioAlocacao
        pessoaId={pessoaId}
        aberto={criando}
        contratos={contratos}
        aoFechar={() => setCriando(false)}
      />

      <DialogoConfirmacao
        aberto={paraEncerrar !== null}
        aoFechar={() => setParaEncerrar(null)}
        titulo="Encerrar alocação"
        destrutivo={false}
        descricao={
          <span className="grid gap-3">
            <span>
              A alocação de <strong>{paraEncerrar?.funcao}</strong> em{" "}
              {paraEncerrar?.unidade_nome} recebe a data de saída e sai das vigentes. O
              registro continua no histórico.
            </span>
            <span className="grid gap-1.5">
              <label htmlFor="data-fim" className="text-sm font-medium text-texto">
                Data de fim
              </label>
              <input
                id="data-fim"
                type="date"
                value={dataFim}
                min={paraEncerrar?.data_inicio}
                onChange={(e) => setDataFim(e.target.value)}
                className="h-11 rounded-md border border-borda bg-fundo px-3 text-base"
              />
            </span>
          </span>
        }
        rotuloAcao="Encerrar alocação"
        aoConfirmar={async () => {
          if (!paraEncerrar) return;
          const r = await encerrarAlocacao({ id: paraEncerrar.id, data_fim: dataFim });
          if (r.ok) {
            toast.success("Alocação encerrada.");
            setParaEncerrar(null);
          } else {
            toast.error(r.erro);
          }
        }}
      />
    </div>
  );
}
