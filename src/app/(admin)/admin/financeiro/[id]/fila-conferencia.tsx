"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { CampoTexto } from "@/components/campo-texto";
import { Button } from "@/components/ui/button";
import { conferirLancamento } from "@/features/financeiro/actions";
import { formatarReais } from "@/features/financeiro/painel";
import type { LancamentoDaTela } from "@/features/financeiro/queries";

import { BotaoDescartar } from "./botao-descartar";
import { SeletorCategoria } from "./formulario-lancamento";

/**
 * O que a IA registrou com dúvida. A equipe lê o que chegou (transcrição do
 * áudio, foto), corrige se preciso e confirma — só então o valor entra nos
 * números do mês.
 */
export function FilaDeConferencia({ itens, podeEditar }: { itens: LancamentoDaTela[]; podeEditar: boolean }) {
  return (
    <section aria-labelledby="fila" className="mb-6 rounded-lg border border-alerta/40 bg-fundo p-5">
      <h3 id="fila" className="text-base font-semibold">A conferir</h3>
      <p className="mb-3 text-sm text-texto-suave">
        Chegaram pelo WhatsApp e a leitura automática ficou em dúvida. Confira cada um.
      </p>
      <ul className="grid gap-3">
        {itens.map((l) => (
          <li key={l.id} className="rounded-md border border-borda p-4">
            <ItemDaFila item={l} podeEditar={podeEditar} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ItemDaFila({ item, podeEditar }: { item: LancamentoDaTela; podeEditar: boolean }) {
  const router = useRouter();
  const [categoria, setCategoria] = useState(item.categoria);
  const [descricao, setDescricao] = useState(item.descricao);
  const [valor, setValor] = useState(item.valor.toFixed(2).replace(".", ","));
  const [processando, setProcessando] = useState(false);

  return (
    <div className="grid gap-3">
      <div className="grid gap-1 text-sm">
        {item.transcricao ? (
          <p>
            <span className="text-texto-suave">O que chegou: </span>“{item.transcricao}”
          </p>
        ) : null}
        {item.duvidas.length ? (
          <p className="text-alerta">Dúvida: {item.duvidas.join(" ")}</p>
        ) : null}
        <p className="text-texto-suave">
          Leitura: {formatarReais(item.valor)}
          {item.cargo ? ` · ${item.cargo}` : ""}
          {item.anexos.length ? (
            <>
              {" · "}
              <a href={`/api/financeiro/anexos/${item.anexos[0].id}`} target="_blank" rel="noopener" className="text-acao hover:underline">
                ver comprovante
              </a>
            </>
          ) : null}
        </p>
      </div>
      {podeEditar ? (
        <form
          className="grid items-start gap-x-3 sm:grid-cols-[1fr_1fr_10rem]"
          onSubmit={async (e) => {
            e.preventDefault();
            setProcessando(true);
            const r = await conferirLancamento({ lancamento_id: item.id, categoria, descricao, valor });
            setProcessando(false);
            if (!r.ok) {
              toast.error(r.erro);
              return;
            }
            toast.success("Lançamento conferido.");
            router.refresh();
          }}
        >
          <SeletorCategoria valor={categoria} aoMudar={setCategoria} />
          <CampoTexto rotulo="Descrição" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={240} required />
          <CampoTexto rotulo="Valor (R$)" value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" required />
          <div className="flex flex-wrap gap-2 sm:col-span-3">
            <Button type="submit" className="min-h-11 px-4" disabled={processando}>
              {processando ? "Aguarde…" : "Confirmar"}
            </Button>
            <BotaoDescartar lancamentoId={item.id} descricao={item.descricao} />
          </div>
        </form>
      ) : null}
    </div>
  );
}
