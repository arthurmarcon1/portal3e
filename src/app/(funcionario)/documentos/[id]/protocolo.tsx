import Link from "next/link";
import { CircleCheck, FileDown, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatarDataHora } from "@/features/documentos/formato";
import { cn } from "@/lib/utils";

/**
 * O protocolo da resposta (docs/04): número GRANDE — é o que a pessoa vai
 * fotografar para guardar —, data e hora.
 *
 * `destaque` é a tela logo depois de responder: ocupa a página e leva de
 * volta ao início. Sem ele é o resumo que aparece acima do documento quando a
 * pessoa volta a abrir algo que já respondeu.
 *
 * O comprovante em PDF (F3.5) sai de `/api/ciencias/[id]/comprovante`, que
 * confere a RLS e registra o download. É botão secundário: o primário da
 * tela de protocolo continua sendo voltar ao início (docs/04, um primário
 * por tela).
 */
export function Protocolo({
  cienciaId,
  tipo,
  protocolo,
  respondidoEm,
  solicitacaoProtocolo,
  aviso,
  destaque = false,
}: {
  cienciaId: string;
  tipo: "confirmacao" | "divergencia";
  protocolo: string;
  respondidoEm: string;
  solicitacaoProtocolo?: string | null;
  aviso?: string | null;
  destaque?: boolean;
}) {
  const confirmou = tipo === "confirmacao";
  const Icone = confirmou ? CircleCheck : TriangleAlert;

  return (
    <section
      aria-live={destaque ? "polite" : undefined}
      className={cn("grid gap-4 rounded-lg border border-borda bg-fundo-alt p-4", destaque && "mt-2")}
    >
      <p className={cn("flex items-center gap-2 font-medium", confirmou ? "text-sucesso" : "text-alerta")}>
        <Icone aria-hidden strokeWidth={1.5} className="size-5" />
        {confirmou ? "Ciência confirmada" : "Divergência registrada"}
      </p>

      <div>
        <p className="text-texto-suave">Protocolo</p>
        <p className="text-[2rem] leading-tight font-semibold tracking-wide tabular-nums">{protocolo}</p>
        <p className="text-texto-suave tabular-nums">em {formatarDataHora(respondidoEm).replace(", ", " às ")}</p>
      </div>

      {!confirmou && solicitacaoProtocolo ? (
        <p>
          Abrimos a solicitação <strong className="tabular-nums">{solicitacaoProtocolo}</strong> para o
          RH analisar o que você apontou. A resposta chega pelo Portal.
        </p>
      ) : null}

      {aviso ? (
        <p role="status" className="text-alerta">
          {aviso}
        </p>
      ) : null}

      <Button asChild variant="outline" className="h-12 w-full text-base">
        <a href={`/api/ciencias/${cienciaId}/comprovante`} download>
          <FileDown aria-hidden strokeWidth={1.5} className="size-5" />
          Baixar comprovante em PDF
        </a>
      </Button>

      {destaque ? (
        <>
          <p className="text-texto-suave">
            Guarde o comprovante, ou anote este número ou tire um print desta tela.
          </p>
          <Button asChild className="h-12 w-full text-base">
            <Link href="/inicio">Voltar ao início</Link>
          </Button>
        </>
      ) : null}
    </section>
  );
}
