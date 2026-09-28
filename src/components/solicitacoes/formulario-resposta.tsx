"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { responderSolicitacao } from "@/features/solicitacoes/actions";

/**
 * Resposta do solicitante quando a solicitação está "aguardando você"
 * (funcionário e contratante). O comentário e a volta para análise saem
 * juntos, na função do banco.
 */
export function FormularioResposta({ solicitacaoId }: { solicitacaoId: string }) {
  const id = useId();
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    try {
      const r = await responderSolicitacao({ solicitacao_id: solicitacaoId, texto });
      if (!r.ok) return void toast.error(r.erro);
      toast.success("Resposta enviada");
      setTexto("");
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="grid gap-2 rounded-lg border border-alerta/40 p-3">
      <Label htmlFor={id} className="text-base">
        A 3e está esperando sua resposta
      </Label>
      <Textarea id={id} rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} className="text-base md:text-base" />
      <Button type="submit" className="h-12 w-full text-base sm:w-auto" disabled={enviando || texto.trim().length < 5}>
        {enviando ? "Enviando…" : "Enviar resposta"}
      </Button>
    </form>
  );
}
