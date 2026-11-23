"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";

import { AvisoErro } from "@/components/aviso-erro";
import { CampoSelecao } from "@/components/campo-selecao";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { enviarAlimentacao } from "@/features/alimentacoes/actions";
import { TAMANHO_MAXIMO } from "@/features/documentos/arquivo-limites";

/**
 * Envio do original. Com um contrato só, ele já vem escolhido.
 *
 * Não é react-hook-form de propósito: o formulário tem um select e um
 * arquivo, e a validação de verdade (conteúdo do arquivo, contrato no escopo)
 * só existe no servidor.
 */
export function FormularioEnvio({
  contratos,
  transcricaoAutomatica,
}: {
  contratos: { id: string; nome: string }[];
  transcricaoAutomatica: boolean;
}) {
  const router = useRouter();
  const idArquivo = useId();
  const [contrato, setContrato] = useState<string | undefined>(contratos.length === 1 ? contratos[0].id : undefined);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    if (!contrato) return setErro("Escolha o contrato.");
    if (!arquivo) return setErro("Escolha o áudio ou a foto que o produtor mandou.");
    if (arquivo.size > TAMANHO_MAXIMO) return setErro("O arquivo passa de 7 MB. Envie um áudio mais curto.");

    const dados = new FormData();
    dados.set("contrato_id", contrato);
    dados.set("arquivo", arquivo);
    setEnviando(true);
    const r = await enviarAlimentacao(dados);
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);
    if (r.dados.aviso) toast.message(r.dados.aviso);
    else toast.success("Alimentação recebida. Confira a sugestão.");
    router.push(`/admin/alimentacoes/${r.dados.id}`);
  }

  return (
    <form onSubmit={enviar} className="superficie grid max-w-2xl gap-4 p-5" noValidate>
      <div>
        <h2 className="text-base font-semibold">Nova alimentação</h2>
        <p className="mt-1 text-sm text-texto-suave">
          {transcricaoAutomatica
            ? "O áudio é transcrito e o Portal sugere cliente, rubrica, valor e mês. Nada vira lançamento antes da sua conferência."
            : "A transcrição automática está desligada neste ambiente: depois de enviar, ouça o áudio e digite o que foi dito. O Portal sugere os campos a partir do texto."}
        </p>
      </div>
      <AvisoErro mensagem={erro} />
      <CampoSelecao rotulo="Contrato" opcoes={contratos} valor={contrato} aoMudar={setContrato} />
      <div className="grid gap-1.5">
        <Label htmlFor={idArquivo}>Áudio ou foto</Label>
        <p className="text-sm text-texto-suave">Áudio do WhatsApp, MP3, M4A ou WAV; foto JPG ou PNG. Até 7 MB.</p>
        <input
          id={idArquivo}
          type="file"
          accept="audio/*,.ogg,.opus,.m4a,image/jpeg,image/png,image/webp"
          onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
          className="min-h-11 rounded-md border border-input bg-fundo px-2.5 py-2 text-sm file:mr-3 file:rounded-sm file:border-0 file:bg-fundo-alt file:px-3 file:py-1.5 file:text-sm file:font-medium"
        />
      </div>
      <div>
        <Button type="submit" disabled={enviando} className="h-11">
          <Upload aria-hidden strokeWidth={1.5} />
          {enviando ? "Enviando…" : "Enviar para conferência"}
        </Button>
      </div>
    </form>
  );
}
