"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import { CampoTexto } from "@/components/campo-texto";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { criarLancamento } from "@/features/financeiro/actions";
import { opcoesDeCategoria } from "@/features/financeiro/categorias";

const CLASSE_SELECT =
  "h-11 w-full rounded-md border border-borda-campo bg-fundo px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acao";

/** Tipo do lançamento, agrupado como no painel. Native select: tem `optgroup`. */
export function SeletorCategoria({
  valor,
  aoMudar,
  rotulo = "Tipo",
}: {
  valor: string;
  aoMudar: (v: string) => void;
  rotulo?: string;
}) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <select id={id} value={valor} onChange={(e) => aoMudar(e.target.value)} className={CLASSE_SELECT} required>
        <option value="" disabled>
          Escolha…
        </option>
        {opcoesDeCategoria().map((g) => (
          <optgroup key={g.grupo} label={g.grupo}>
            {g.itens.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

/**
 * Lançamento pela tela, com a foto ou o PDF da nota. O mesmo caminho que o
 * WhatsApp vai usar depois — lá, quem preenche estes campos é a IA.
 */
export function FormularioLancamento({
  competenciaId,
  postos,
}: {
  competenciaId: string;
  postos: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const idPosto = useId();
  const idArquivo = useId();
  const arquivoRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [categoria, setCategoria] = useState("");
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  return (
    <section aria-labelledby="novo-lancamento" className="mb-6 rounded-lg border border-borda bg-fundo p-5">
      <h3 id="novo-lancamento" className="text-base font-semibold">Novo lançamento</h3>
      <p className="mb-4 text-sm text-texto-suave">
        Nota emitida, folha, férias, viagem, alimentação, EPI. Anexe a foto ou o PDF do comprovante quando houver.
      </p>
      <form
        ref={formRef}
        className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setErro(null);
          const dados = new FormData(e.currentTarget);
          dados.set("competencia_id", competenciaId);
          dados.set("categoria", categoria);
          setProcessando(true);
          const r = await criarLancamento(dados);
          setProcessando(false);
          if (!r.ok) {
            setErro(r.erro);
            toast.error(r.erro);
            router.refresh();
            return;
          }
          toast.success("Lançamento registrado.");
          formRef.current?.reset();
          setCategoria("");
          router.refresh();
        }}
      >
        <div className="pb-6">
          <SeletorCategoria valor={categoria} aoMudar={setCategoria} />
        </div>
        <CampoTexto rotulo="Valor (R$)" name="valor" inputMode="decimal" placeholder="0,00" required />
        <div className="sm:col-span-2">
          <CampoTexto rotulo="Descrição" name="descricao" maxLength={240} placeholder="Ex.: almoço da equipe na visita de 10/11" required />
        </div>
        <CampoTexto rotulo="Data do comprovante" name="data_documento" type="date" />
        <div className="grid gap-1.5 pb-6">
          <Label htmlFor={idPosto}>Posto (opcional)</Label>
          <select id={idPosto} name="posto_id" defaultValue="nenhum" className={CLASSE_SELECT}>
            <option value="nenhum">Do contrato todo</option>
            {postos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5 pb-6 sm:col-span-2">
          <Label htmlFor={idArquivo}>Foto ou PDF do comprovante (opcional)</Label>
          <input
            id={idArquivo}
            ref={arquivoRef}
            name="arquivo"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="min-h-11 rounded-md border border-borda-campo px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-fundo-alt file:px-3 file:py-1.5 file:text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
          <Button type="submit" className="min-h-11 px-4" disabled={processando || !categoria}>
            {processando ? "Registrando…" : "Registrar lançamento"}
          </Button>
          <p aria-live="polite" className="text-sm text-erro">
            {erro}
          </p>
        </div>
      </form>
    </section>
  );
}
