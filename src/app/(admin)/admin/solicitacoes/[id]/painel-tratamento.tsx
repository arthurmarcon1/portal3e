"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { CampoSelecao } from "@/components/campo-selecao";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  atribuirResponsavel,
  comentarSolicitacao,
  mudarStatusSolicitacao,
} from "@/features/solicitacoes/actions";
import { encerrada, ROTULO_STATUS_INTERNO, type StatusSolicitacao } from "@/features/solicitacoes/fluxo";

const NINGUEM = "ninguem";

/**
 * Tratamento da solicitação (interno com `solicitacoes:editar`): atribuir,
 * mudar a situação e comentar. Só oferece as transições que o banco aceita
 * (`TRANSICOES` = `app.transicao_valida`). O evento de status é gravado pelo
 * trigger do banco — aqui só se pede a mudança.
 */
export function PainelTratamento({
  solicitacaoId,
  status,
  proximos,
  responsavelId,
  responsaveis,
}: {
  solicitacaoId: string;
  status: StatusSolicitacao;
  proximos: StatusSolicitacao[];
  responsavelId: string | null;
  responsaveis: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [responsavel, setResponsavel] = useState(responsavelId ?? NINGUEM);
  const [novo, setNovo] = useState<string>("");
  const [comentarioStatus, setComentarioStatus] = useState("");
  const [comentario, setComentario] = useState("");
  const [nota, setNota] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  async function executar(acao: () => Promise<{ ok: boolean; erro?: string }>, sucesso: string) {
    setOcupado(true);
    try {
      const r = await acao();
      if (!r.ok) return void toast.error(r.erro);
      toast.success(sucesso);
      router.refresh();
      return true;
    } finally {
      setOcupado(false);
    }
  }

  if (encerrada(status)) {
    return (
      <aside className="h-fit rounded-lg border border-borda bg-fundo-alt p-4 text-sm text-texto-suave">
        Solicitação encerrada. A linha do tempo fica como registro.
      </aside>
    );
  }

  return (
    <aside className="grid h-fit gap-5 rounded-lg border border-borda p-4">
      <div className="grid gap-2">
        <CampoSelecao
          rotulo="Responsável"
          opcoes={[{ id: NINGUEM, nome: "Sem responsável" }, ...responsaveis]}
          valor={responsavel}
          aoMudar={setResponsavel}
        />
        <Button
          type="button"
          variant="outline"
          disabled={ocupado || responsavel === (responsavelId ?? NINGUEM)}
          onClick={() =>
            executar(
              () =>
                atribuirResponsavel({
                  solicitacao_id: solicitacaoId,
                  responsavel_id: responsavel === NINGUEM ? null : responsavel,
                }),
              "Responsável atualizado",
            )
          }
        >
          Atribuir
        </Button>
      </div>

      <div className="grid gap-2 border-t border-borda pt-4">
        <CampoSelecao
          rotulo="Mudar situação para"
          opcoes={proximos.map((s) => ({ id: s, nome: ROTULO_STATUS_INTERNO[s] }))}
          valor={novo}
          aoMudar={setNovo}
        />
        <Label htmlFor="comentario-status">Mensagem ao solicitante (opcional)</Label>
        <Textarea id="comentario-status" rows={3} value={comentarioStatus} onChange={(e) => setComentarioStatus(e.target.value)} />
        <Button
          type="button"
          disabled={ocupado || !novo}
          onClick={async () => {
            const ok = await executar(
              () =>
                mudarStatusSolicitacao({
                  solicitacao_id: solicitacaoId,
                  status: novo,
                  comentario: comentarioStatus,
                }),
              "Situação atualizada",
            );
            if (ok) {
              setNovo("");
              setComentarioStatus("");
            }
          }}
        >
          Mudar situação
        </Button>
      </div>

      <div className="grid gap-2 border-t border-borda pt-4">
        <Label htmlFor="comentario">Comentário</Label>
        <Textarea id="comentario" rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} />
        <div className="flex items-center gap-2">
          <Checkbox id="nota" checked={nota} onCheckedChange={(v) => setNota(v === true)} />
          <Label htmlFor="nota" className="font-normal">
            Nota interna — o solicitante não vê
          </Label>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={ocupado || comentario.trim().length < 2}
          onClick={async () => {
            const ok = await executar(
              () => comentarSolicitacao({ solicitacao_id: solicitacaoId, texto: comentario, interno: nota }),
              nota ? "Nota interna registrada" : "Comentário enviado",
            );
            if (ok) {
              setComentario("");
              setNota(false);
            }
          }}
        >
          {nota ? "Registrar nota interna" : "Enviar comentário"}
        </Button>
      </div>
    </aside>
  );
}
