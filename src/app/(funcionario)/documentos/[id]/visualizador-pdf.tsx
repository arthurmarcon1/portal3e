"use client";

import { Download, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

/**
 * O documento aberto na própria tela (docs/04, tela de ciência, bloco 1).
 *
 * pdf.js desenhando cada página num `<canvas>` da largura da coluna, e não
 * `<iframe>` do PDF: o Chrome do Android não mostra PDF em iframe — oferece
 * baixar, e "abrir em outro app é onde o fluxo morre". O arquivo vem de
 * `/api/documentos/[id]/download` (F3.2), que confere a RLS e registra a
 * visualização na auditoria.
 *
 * As páginas são desenhadas quando chegam perto da tela: norma de dez páginas
 * num celular antigo não pode travar antes de a primeira aparecer. Resolução
 * limitada a 2× — acima disso o canvas come memória sem ganho visível.
 */

type Estado =
  | { fase: "carregando" }
  | { fase: "pronto"; paginas: number }
  | { fase: "erro"; mensagem: string };

export function VisualizadorPdf({ documentoId, titulo }: { documentoId: string; titulo: string }) {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  // Página A4 na largura de um celular deixa o texto com ~5px: legível para
  // ver o formato, não para conferir horário. Ampliar dobra a largura e a
  // página rola de lado — o zoom de pinça continua valendo também.
  const [ampliado, setAmpliado] = useState(false);
  const pdf = useRef<PDFDocumentProxy | null>(null);
  const urlArquivo = `/api/documentos/${documentoId}/download`;

  useEffect(() => {
    let cancelado = false;

    (async () => {
      try {
        const resposta = await fetch(urlArquivo);
        if (!resposta.ok) {
          throw new Error(
            resposta.status === 428
              ? "Este documento pede um código de confirmação para abrir. Essa verificação chega em breve ao Portal."
              : "Não foi possível abrir o documento. Tente novamente em alguns minutos ou fale com o RH pelo chamado.",
          );
        }
        const dados = new Uint8Array(await resposta.arrayBuffer());

        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const documento = await pdfjs.getDocument({ data: dados }).promise;
        if (cancelado) return void documento.destroy();
        pdf.current = documento;
        setEstado({ fase: "pronto", paginas: documento.numPages });
      } catch (erro) {
        if (cancelado) return;
        setEstado({
          fase: "erro",
          mensagem:
            erro instanceof Error && erro.message.startsWith("Este documento")
              ? erro.message
              : "Não foi possível abrir o documento. Tente novamente em alguns minutos ou fale com o RH pelo chamado.",
        });
      }
    })();

    return () => {
      cancelado = true;
      void pdf.current?.destroy();
      pdf.current = null;
    };
  }, [urlArquivo]);

  if (estado.fase === "erro") {
    return (
      <div role="alert" className="rounded-lg border border-borda bg-fundo-alt px-4 py-6 text-center">
        <p>{estado.mensagem}</p>
      </div>
    );
  }

  return (
    <section aria-label={`Documento: ${titulo}`} className="grid min-w-0 gap-3">
      {estado.fase === "carregando" ? (
        <div
          aria-live="polite"
          className="grid aspect-[1/1.414] w-full place-items-center rounded-lg border border-borda bg-fundo-alt text-texto-suave"
        >
          Abrindo o documento…
        </div>
      ) : (
        <>
          <button
            type="button"
            aria-pressed={ampliado}
            onClick={() => setAmpliado((v) => !v)}
            className="inline-flex min-h-11 items-center gap-2 justify-self-start rounded-md border border-borda px-3"
          >
            {ampliado ? (
              <ZoomOut aria-hidden strokeWidth={1.5} className="size-5" />
            ) : (
              <ZoomIn aria-hidden strokeWidth={1.5} className="size-5" />
            )}
            {ampliado ? "Ver a página inteira" : "Ampliar o texto"}
          </button>
          <div className={ampliado ? "-mx-4 overflow-x-auto px-4" : undefined}>
            <div className={ampliado ? "grid w-[200%] gap-3" : "grid gap-3"}>
              {Array.from({ length: estado.paginas }, (_, i) => (
                <Pagina
                  key={i}
                  pdf={pdf}
                  numero={i + 1}
                  total={estado.paginas}
                  ampliado={ampliado}
                />
              ))}
            </div>
          </div>
        </>
      )}

      <a
        href={`${urlArquivo}?baixar=1`}
        className="inline-flex min-h-11 items-center gap-2 justify-self-start text-acao underline underline-offset-2"
      >
        <Download aria-hidden strokeWidth={1.5} className="size-5" />
        Baixar o PDF
      </a>
    </section>
  );
}

function Pagina({
  pdf,
  numero,
  total,
  ampliado,
}: {
  pdf: React.RefObject<PDFDocumentProxy | null>;
  numero: number;
  total: number;
  ampliado: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [proporcao, setProporcao] = useState(1.414);

  useEffect(() => {
    const alvo = canvas.current;
    if (!alvo) return;
    let encerrado = false;
    // Um canvas só aceita um render por vez: trocar a ampliação no meio de
    // um desenho (ou o efeito rodar duas vezes em dev) cancela o anterior.
    let tarefa: RenderTask | null = null;

    async function desenhar() {
      const documento = pdf.current;
      if (!documento || !alvo || encerrado) return;

      const pagina = await documento.getPage(numero);
      if (encerrado) return;
      const base = pagina.getViewport({ scale: 1 });
      setProporcao(base.height / base.width);

      const largura = alvo.parentElement?.clientWidth ?? 360;
      const densidade = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pagina.getViewport({ scale: (largura / base.width) * densidade });

      alvo.width = Math.floor(viewport.width);
      alvo.height = Math.floor(viewport.height);
      tarefa = pagina.render({ canvas: alvo, viewport });
      try {
        await tarefa.promise;
      } catch (erro) {
        // Cancelamento é o caminho normal da limpeza, não falha.
        if ((erro as { name?: string }).name !== "RenderingCancelledException") throw erro;
      }
    }

    // A primeira página desenha já; as outras quando chegam perto da tela.
    let observador: IntersectionObserver | null = null;
    if (numero === 1) {
      void desenhar();
    } else {
      observador = new IntersectionObserver(
        (entradas) => {
          if (entradas.some((e) => e.isIntersecting)) {
            observador?.disconnect();
            void desenhar();
          }
        },
        { rootMargin: "400px" },
      );
      observador.observe(alvo);
    }

    return () => {
      encerrado = true;
      observador?.disconnect();
      tarefa?.cancel();
    };
  }, [pdf, numero, ampliado]);

  return (
    <div className="overflow-hidden rounded-lg border border-borda bg-white">
      <canvas
        ref={canvas}
        role="img"
        aria-label={`Página ${numero} de ${total}`}
        className="block w-full"
        style={{ aspectRatio: `1 / ${proporcao}` }}
      />
    </div>
  );
}
