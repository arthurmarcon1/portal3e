import { Paperclip } from "lucide-react";

import { formatarBytes, formatarDataHora } from "@/features/documentos/formato";
import { ROTULO_STATUS, ROTULO_STATUS_INTERNO } from "@/features/solicitacoes/fluxo";
import type { Anexo, EventoDaLinhaDoTempo } from "@/features/solicitacoes/queries";
import { cn } from "@/lib/utils";

/**
 * Linha do tempo da solicitação — imutável no banco (0020), só leitura aqui.
 *
 * Nota interna só chega a quem é interno (`eventos_leitura`); a marcação
 * visual é para quem trata não esquecer que o solicitante não a vê.
 */
export function LinhaDoTempo({
  eventos,
  usuarioId,
  perspectiva,
}: {
  eventos: EventoDaLinhaDoTempo[];
  usuarioId: string;
  perspectiva: "solicitante" | "interno";
}) {
  const rotulos = perspectiva === "interno" ? ROTULO_STATUS_INTERNO : ROTULO_STATUS;

  if (eventos.length === 0) {
    return <p className="text-texto-suave">Nenhuma movimentação ainda.</p>;
  }

  return (
    <ol className="grid gap-3">
      {eventos.map((e) => {
        const autor =
          e.autor?.id === usuarioId
            ? "Você"
            : perspectiva === "solicitante" && e.autor?.interno
              ? `${e.autor.nome} (3e)`
              : (e.autor?.nome ?? "Portal");
        return (
          <li
            key={e.id}
            className={cn(
              "rounded-lg border px-3 py-2",
              e.interno ? "border-alerta/40 bg-alerta/5" : "border-borda",
            )}
          >
            <p className="text-sm text-texto-suave">
              <span className="font-medium text-texto">{autor}</span> · {formatarDataHora(e.criado_em)}
              {e.interno ? <span className="ml-1 text-alerta">· nota interna, o solicitante não vê</span> : null}
            </p>
            {e.tipo === "mudanca_status" && e.status_novo ? (
              <p>
                Situação: {e.status_anterior ? `${rotulos[e.status_anterior]} → ` : ""}
                <strong className="font-medium">{rotulos[e.status_novo]}</strong>
              </p>
            ) : e.tipo === "atribuicao" ? (
              <p>Responsável: {e.conteudo}</p>
            ) : (
              <p className="whitespace-pre-line">{e.conteudo}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function ListaDeAnexos({ anexos }: { anexos: Anexo[] }) {
  if (!anexos.length) return null;
  return (
    <ul className="grid gap-1">
      {anexos.map((a, i) => (
        <li key={a.id}>
          <a
            href={`/api/anexos/${a.id}`}
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-11 items-center gap-2 text-acao underline underline-offset-2"
          >
            <Paperclip aria-hidden strokeWidth={1.5} className="size-4" />
            {a.mime === "application/pdf" ? "PDF" : "Foto"} {anexos.length > 1 ? i + 1 : ""} ({formatarBytes(a.bytes)})
          </a>
        </li>
      ))}
    </ul>
  );
}
