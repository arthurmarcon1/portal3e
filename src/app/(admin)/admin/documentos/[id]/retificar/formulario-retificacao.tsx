"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { AvisoErro } from "@/components/aviso-erro";
import { CampoTexto } from "@/components/campo-texto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { retificarDocumento } from "@/features/documentos/actions";
import { TAMANHO_MAXIMO } from "@/features/documentos/arquivo-limites";
import { esquemaRetificacao, type EntradaRetificacao } from "@/features/documentos/schemas";

export function FormularioRetificacao({
  documentoId,
  titulo,
  descricao,
}: {
  documentoId: string;
  titulo: string;
  descricao: string | null;
}) {
  const router = useRouter();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof esquemaRetificacao>, unknown, EntradaRetificacao>({
    resolver: zodResolver(esquemaRetificacao),
    defaultValues: { documento_id: documentoId, titulo, descricao: descricao ?? "" },
  });

  async function enviar(entrada: EntradaRetificacao) {
    setErroGeral(null);
    if (!arquivo) {
      setErroArquivo("Escolha o arquivo PDF corrigido.");
      return;
    }
    const formData = new FormData();
    formData.append("dados", JSON.stringify(entrada));
    formData.append("arquivo", arquivo);

    const r = await retificarDocumento(formData);
    if (!r.ok) return setErroGeral(r.erro);
    toast.success("Retificação salva como rascunho. Confira a prévia e publique.");
    router.push(`/admin/documentos/${r.dados.id}`);
  }

  return (
    <form onSubmit={handleSubmit(enviar)} className="grid max-w-2xl gap-4" noValidate>
      <AvisoErro mensagem={erroGeral} />
      <input type="hidden" {...register("documento_id")} />

      <CampoTexto rotulo="Título" erro={errors.titulo?.message} {...register("titulo")} />

      <div className="grid gap-1.5">
        <Label htmlFor="descricao">Descrição (opcional)</Label>
        <Textarea id="descricao" rows={3} {...register("descricao")} />
        <p aria-live="polite" className="min-h-5 text-sm text-erro">
          {errors.descricao?.message}
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="arquivo">Arquivo PDF corrigido</Label>
        <p className="text-sm text-texto-suave">Até 7 MB.</p>
        <Input
          id="arquivo"
          type="file"
          accept="application/pdf,.pdf"
          className="h-11 py-2"
          aria-invalid={erroArquivo ? true : undefined}
          onChange={(e) => {
            const escolhido = e.target.files?.[0] ?? null;
            setErroArquivo(
              escolhido && escolhido.size > TAMANHO_MAXIMO
                ? "O arquivo passa de 7 MB. Reduza o PDF e envie de novo."
                : null,
            );
            setArquivo(escolhido && escolhido.size <= TAMANHO_MAXIMO ? escolhido : null);
          }}
        />
        <p aria-live="polite" className="min-h-5 text-sm text-erro">
          {erroArquivo}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Salvando…" : "Salvar retificação"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/admin/documentos/${documentoId}`)}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
