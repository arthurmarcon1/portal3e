"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";

import { DialogoConfirmacao } from "@/components/dialogo-confirmacao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { abrirCompetencia, mudarStatusCompetencia } from "@/features/financeiro/actions";

/** Abre um mês do contrato. O previsto sai da planilha que vale nele. */
export function AbrirCompetencia({ contratoId, sugestao }: { contratoId: string; sugestao: string | null }) {
  const router = useRouter();
  const id = useId();
  const [aberto, setAberto] = useState(Boolean(sugestao));
  const [mes, setMes] = useState((sugestao ?? new Date().toISOString()).slice(0, 7));
  const [processando, setProcessando] = useState(false);

  if (!aberto) {
    return (
      <Button type="button" variant="outline" className="min-h-11 px-3" onClick={() => setAberto(true)}>
        <Plus aria-hidden strokeWidth={1.5} className="size-4" />
        Abrir mês
      </Button>
    );
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setProcessando(true);
        const r = await abrirCompetencia({ contrato_id: contratoId, mes });
        setProcessando(false);
        if (!r.ok) {
          toast.error(r.erro);
          return;
        }
        toast.success("Mês aberto.");
        router.push(`/admin/financeiro/${contratoId}?mes=${r.dados.mes.slice(0, 7)}`);
      }}
    >
      <Label htmlFor={id} className="sr-only">Mês a abrir</Label>
      <Input id={id} type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="h-11 w-44" required />
      <Button type="submit" className="min-h-11 px-3" disabled={processando}>
        {processando ? "Abrindo…" : "Abrir mês"}
      </Button>
    </form>
  );
}

/** Fecha ou reabre a competência. Fechada, ninguém lança nem corrige (o banco segura). */
export function AcoesDaCompetencia({
  competenciaId,
  status,
  mes,
  pendentes,
}: {
  competenciaId: string;
  status: "aberta" | "fechada";
  mes: string;
  pendentes: number;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const fechar = status === "aberta";

  return (
    <>
      <Button type="button" variant="outline" className="min-h-11 px-4" onClick={() => setConfirmando(true)}>
        {fechar ? "Fechar o mês" : "Reabrir o mês"}
      </Button>
      <DialogoConfirmacao
        aberto={confirmando}
        aoFechar={() => setConfirmando(false)}
        titulo={fechar ? `Fechar ${mes}?` : `Reabrir ${mes}?`}
        descricao={
          fechar
            ? pendentes > 0
              ? `Há ${pendentes} lançamento(s) a conferir. Confira ou descarte antes de fechar.`
              : "Com o mês fechado, ninguém lança nem corrige até alguém reabrir. Os números ficam como estão."
            : "O mês volta a aceitar lançamentos e correções. A reabertura fica registrada na auditoria."
        }
        rotuloAcao={fechar ? "Fechar o mês" : "Reabrir o mês"}
        destrutivo={false}
        aoConfirmar={async () => {
          const r = await mudarStatusCompetencia({ competencia_id: competenciaId, status: fechar ? "fechada" : "aberta" });
          if (!r.ok) {
            toast.error(r.erro);
            return;
          }
          toast.success(fechar ? "Mês fechado." : "Mês reaberto.");
          setConfirmando(false);
          router.refresh();
        }}
      />
    </>
  );
}
