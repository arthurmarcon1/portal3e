"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FilePen, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CampoTexto } from "@/components/campo-texto";
import { DialogoConfirmacao } from "@/components/dialogo-confirmacao";
import { MenuLinha } from "@/components/menu-linha";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  arquivarDocumento,
  descartarRascunho,
  publicarDocumento,
} from "@/features/documentos/actions";

function hojeEmBrasilia(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

/**
 * Ações do detalhe. Só aparecem para quem tem `documentos:editar` — e cada
 * Server Action confere de novo, e a RLS e os triggers da 0015 por último.
 */
export function AcoesDocumento({
  documento,
  prazoPadrao,
}: {
  documento: {
    id: string;
    titulo: string;
    status: "rascunho" | "publicado" | "arquivado";
    escopo: "individual" | "coletivo";
    exigeCiencia: boolean;
    /** Tipo que vence, em documento individual: pede "válido até" (F5.2). */
    vence: boolean;
    /** Versão que esta retificação vai arquivar ao ser publicada. */
    substituiVersao: number | null;
  };
  /** Hoje + prazo padrão do tipo, em Brasília; `null` se o tipo não pede ciência. */
  prazoPadrao: string | null;
}) {
  const router = useRouter();
  const [dialogo, setDialogo] = useState<"publicar" | "arquivar" | "descartar" | null>(null);
  const [prazo, setPrazo] = useState(prazoPadrao ?? "");
  const [validoAte, setValidoAte] = useState("");
  const [publicando, setPublicando] = useState(false);

  async function publicar() {
    setPublicando(true);
    try {
      const r = await publicarDocumento({
        documento_id: documento.id,
        // Vazio = o banco aplica o padrão do tipo na data de publicação.
        prazo_ciencia: documento.exigeCiencia ? prazo : "",
        valido_ate: documento.vence ? validoAte : "",
      });
      if (!r.ok) return void toast.error(r.erro);
      const n = r.dados.destinatarios;
      toast.success(
        n === 1 ? "Documento publicado para 1 pessoa." : `Documento publicado para ${n} pessoas.`,
      );
      setDialogo(null);
      router.refresh();
    } finally {
      setPublicando(false);
    }
  }

  if (documento.status === "arquivado") return null;

  if (documento.status === "publicado") {
    return (
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" asChild>
          <Link href={`/admin/documentos/${documento.id}/retificar`}>
            <FilePen aria-hidden strokeWidth={1.5} />
            Retificar
          </Link>
        </Button>
        <MenuLinha>
          <DropdownMenuItem variant="destructive" onSelect={() => setDialogo("arquivar")}>
            Arquivar documento
          </DropdownMenuItem>
        </MenuLinha>

        <DialogoConfirmacao
          aberto={dialogo === "arquivar"}
          aoFechar={() => setDialogo(null)}
          titulo="Arquivar documento"
          descricao={
            <>
              <strong>{documento.titulo}</strong> sai de circulação: deixa de aparecer para
              quem recebeu e para de contar como pendência. O registro e as ciências já
              dadas ficam guardados. Não há como republicar — para corrigir o conteúdo, use
              Retificar.
            </>
          }
          rotuloAcao="Arquivar documento"
          aoConfirmar={async () => {
            const r = await arquivarDocumento({ documento_id: documento.id });
            if (!r.ok) return void toast.error(r.erro);
            toast.success("Documento arquivado.");
            setDialogo(null);
            router.refresh();
          }}
        />
      </div>
    );
  }

  // Rascunho
  return (
    <div className="flex items-center gap-1">
      <Button type="button" onClick={() => setDialogo("publicar")}>
        <Send aria-hidden strokeWidth={1.5} />
        Publicar documento
      </Button>
      <MenuLinha>
        <DropdownMenuItem variant="destructive" onSelect={() => setDialogo("descartar")}>
          Descartar rascunho
        </DropdownMenuItem>
      </MenuLinha>

      <Dialog open={dialogo === "publicar"} onOpenChange={(v) => !v && setDialogo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Publicar documento</DialogTitle>
            <DialogDescription>
              Publicar <strong>não pode ser desfeito</strong>. Cada pessoa alcançada recebe um
              aviso no Portal
              {documento.exigeCiencia ? " e passa a ter uma pendência de ciência" : ""}. Depois,
              só é possível arquivar ou retificar.
              {documento.substituiVersao
                ? ` A versão ${documento.substituiVersao} será arquivada, com as ciências dela preservadas.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {documento.exigeCiencia ? (
            <CampoTexto
              rotulo="Prazo de ciência"
              dica="Padrão do tipo, contado de hoje em dias corridos. Pode ajustar."
              type="date"
              value={prazo}
              min={hojeEmBrasilia()}
              onChange={(e) => setPrazo(e.target.value)}
            />
          ) : null}
          {documento.vence ? (
            <CampoTexto
              rotulo="Válido até"
              dica="Data de vencimento que está no documento. A 30 dias dela, a equipe de SST é avisada."
              type="date"
              required
              value={validoAte}
              onChange={(e) => setValidoAte(e.target.value)}
            />
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogo(null)} disabled={publicando}>
              Cancelar
            </Button>
            <Button type="button" onClick={publicar} disabled={publicando || (documento.vence && !validoAte)}>
              {publicando ? "Publicando…" : "Publicar documento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DialogoConfirmacao
        aberto={dialogo === "descartar"}
        aoFechar={() => setDialogo(null)}
        titulo="Descartar rascunho"
        descricao={
          <>
            <strong>{documento.titulo}</strong> e o arquivo dele são apagados. Nada foi
            publicado, então ninguém recebeu este documento.
          </>
        }
        rotuloAcao="Descartar rascunho"
        aoConfirmar={async () => {
          const r = await descartarRascunho({ documento_id: documento.id });
          if (!r.ok) return void toast.error(r.erro);
          toast.success("Rascunho descartado.");
          router.push("/admin/documentos");
        }}
      />
    </div>
  );
}
