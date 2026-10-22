"use client";

import { useRouter } from "next/navigation";
import { Camera, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { registrarCiencia } from "@/features/documentos/ciencia";
import { MINIMO_JUSTIFICATIVA } from "@/features/documentos/ciencia-regras";
import { ATENDIMENTO, maiuscula, type TextosDaResposta } from "@/features/funcionario/textos";

/**
 * Tela de ciência (docs/04 — "a mais importante do produto"), desenhada para
 * 360px de largura primeiro.
 *
 * Os textos vêm de `textosDaResposta`, por tipo de documento: no espelho,
 * "Está tudo certo" / "Tem algo errado"; no resto, "Confirmar que li".
 *
 * Uma coluna: o documento, a pergunta, duas ações de mesmo tamanho. A
 * pergunta e as ações ficam numa barra presa ao pé da tela — o documento rola
 * por baixo e a resposta está sempre a um toque, sem "role até o fim para
 * liberar" (docs/04 proíbe rolagem forçada). Os dois botões têm a mesma
 * largura e altura; confirmar é o primário.
 *
 * Confirmar pede um segundo toque num diálogo: a ciência é imutável e tem
 * valor de prova, e um toque acidental no ônibus não pode virar registro
 * jurídico. Divergência não pede — escrever a justificativa já é o gesto
 * deliberado.
 */

type Modo = "escolha" | "divergencia";

export function TelaCiencia({
  documentoId,
  textos,
  children,
}: {
  documentoId: string;
  textos: TextosDaResposta;
  /** O visualizador do documento, vindo da página. */
  children: ReactNode;
}) {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>("escolha");
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const formulario = useRef<HTMLElement>(null);

  async function enviar(dados: FormData, tipo: "confirmacao" | "divergencia") {
    setEnviando(true);
    try {
      dados.set("documento_id", documentoId);
      dados.set("tipo", tipo);
      const r = await registrarCiencia(dados);
      if (!r.ok) {
        toast.error(r.erro);
        return false;
      }
      toast.success(tipo === "confirmacao" ? "Confirmação registrada" : "Aviso de erro enviado");
      // A tela de protocolo é da página, com o número lido do banco — não
      // deste estado local, que o refresh do servidor desmontaria.
      const aviso = r.dados.aviso ? "&aviso=foto" : "";
      router.replace(`/documentos/${documentoId}?respondido=1${aviso}`, { scroll: true });
      return true;
    } finally {
      setEnviando(false);
    }
  }

  useEffect(() => {
    if (modo !== "divergencia") return;
    formulario.current?.scrollIntoView({ block: "start" });
    formulario.current?.querySelector("textarea")?.focus({ preventScroll: true });
  }, [modo]);

  return (
    <>
      {/* O espaço para a barra fixa não cobrir o fim da página fica no layout,
          que reage ao `data-barra-resposta`. */}
      {children}

      {modo === "divergencia" ? (
        <FormularioDivergencia
          ref={formulario}
          enviando={enviando}
          aoVoltar={() => setModo("escolha")}
          aoEnviar={(dados) => enviar(dados, "divergencia")}
        />
      ) : (
        <div
          data-barra-resposta
          className="fixed inset-x-0 bottom-0 z-10 border-t border-borda bg-fundo px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          <div className="mx-auto grid w-full max-w-xl gap-2">
            <p className="font-medium">{textos.pergunta}</p>
            <Button type="button" className="h-12 w-full text-base" onClick={() => setConfirmando(true)}>
              {textos.confirmar}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full text-base"
              onClick={() => setModo("divergencia")}
            >
              {textos.apontarErro}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={confirmando} onOpenChange={(v) => !enviando && setConfirmando(v)}>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
          <DialogHeader>
            {/* `pr-8`: o título longo não passa por baixo do botão de fechar. */}
            <DialogTitle className="pr-8 leading-snug">{textos.dialogoTitulo}</DialogTitle>
            <DialogDescription className="text-base">{textos.dialogoTexto}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="grid gap-2 sm:flex">
            <Button
              type="button"
              className="h-12 w-full text-base sm:w-auto"
              disabled={enviando}
              onClick={() => void enviar(new FormData(), "confirmacao")}
            >
              {enviando ? "Registrando…" : textos.dialogoConfirmar}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full text-base sm:w-auto"
              disabled={enviando}
              onClick={() => setConfirmando(false)}
            >
              Voltar e ler de novo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------
// Divergência
// ---------------------------------------------------------------------

/** Lado maior da foto depois de reduzida: legível, e leve para 3G. */
const LADO_MAXIMO_FOTO = 1600;

/**
 * Reduz a foto no próprio celular antes de enviar. Foto de câmera tem 3–8 MB;
 * reduzida fica em ~300 KB, o que decide se ela chega numa conexão ruim.
 * Se o navegador não souber decodificar (HEIC em alguns Androids), manda a
 * original e o servidor diz se aceita.
 */
async function reduzirFoto(arquivo: File): Promise<Blob> {
  try {
    const imagem = await createImageBitmap(arquivo);
    const escala = Math.min(1, LADO_MAXIMO_FOTO / Math.max(imagem.width, imagem.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(imagem.width * escala);
    canvas.height = Math.round(imagem.height * escala);
    canvas.getContext("2d")?.drawImage(imagem, 0, 0, canvas.width, canvas.height);
    imagem.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.8));
    return blob ?? arquivo;
  } catch {
    return arquivo;
  }
}

function FormularioDivergencia({
  ref,
  enviando,
  aoVoltar,
  aoEnviar,
}: {
  ref: React.Ref<HTMLElement>;
  enviando: boolean;
  aoVoltar: () => void;
  aoEnviar: (dados: FormData) => Promise<boolean>;
}) {
  const id = useId();
  const [texto, setTexto] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const campoFoto = useRef<HTMLInputElement>(null);

  const faltam = Math.max(0, MINIMO_JUSTIFICATIVA - texto.trim().length);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (faltam > 0) {
      setErro(`Escreva mais um pouco explicando o que está errado (faltam ${faltam}).`);
      return;
    }
    setErro(null);
    const dados = new FormData();
    dados.set("justificativa", texto.trim());
    if (foto) dados.set("foto", await reduzirFoto(foto), "foto.jpg");
    await aoEnviar(dados);
  }

  return (
    <section ref={ref} aria-labelledby={`${id}-titulo`} className="mt-6 scroll-mt-4">
      <form onSubmit={enviar} className="grid gap-4" noValidate>
        <h2 id={`${id}-titulo`} className="text-xl">
          O que está errado?
        </h2>

        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-texto`} className="text-base">
            Explique com suas palavras
          </Label>
          <p id={`${id}-dica`} className="text-texto-suave">
            Por exemplo: <em>No dia 12 eu entrei às 7h, não às 8h.</em>
          </p>
          <Textarea
            id={`${id}-texto`}
            rows={5}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            aria-invalid={erro ? true : undefined}
            aria-describedby={`${id}-dica ${id}-contagem ${id}-erro`}
            className="text-base md:text-base"
            maxLength={2000}
          />
          <p id={`${id}-contagem`} aria-live="polite" className="text-sm text-texto-suave">
            {faltam > 0 ? `Escreva mais um pouco (faltam ${faltam}).` : "Pronto para enviar."}
          </p>
          <p id={`${id}-erro`} aria-live="polite" className="min-h-5 text-erro">
            {erro}
          </p>
        </div>

        <div className="grid gap-1.5">
          <span className="font-medium">Foto que ajude a mostrar (não é obrigatória)</span>
          <input
            ref={campoFoto}
            id={`${id}-foto`}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
          />
          {foto ? (
            <div className="flex min-h-12 items-center justify-between gap-2 rounded-md border border-borda px-3">
              <span className="truncate">{foto.name}</span>
              <Button
                type="button"
                variant="ghost"
                className="h-11"
                onClick={() => {
                  setFoto(null);
                  if (campoFoto.current) campoFoto.current.value = "";
                }}
              >
                <X aria-hidden strokeWidth={1.5} />
                Remover foto
              </Button>
            </div>
          ) : (
            <Label
              htmlFor={`${id}-foto`}
              className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md border border-borda text-base font-normal"
            >
              <Camera aria-hidden strokeWidth={1.5} className="size-5" />
              Anexar foto
            </Label>
          )}
        </div>

        <p>
          {maiuscula(ATENDIMENTO.curto)} recebe sua explicação, analisa e responde aqui no Portal, em{" "}
          <strong className="font-medium">Meus pedidos</strong>.
        </p>

        <div className="grid gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button type="submit" className="h-12 w-full text-base" disabled={enviando}>
            {enviando ? "Enviando…" : `Enviar para ${ATENDIMENTO.curto}`}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full text-base"
            disabled={enviando}
            onClick={aoVoltar}
          >
            Voltar ao documento
          </Button>
        </div>
      </form>
    </section>
  );
}
