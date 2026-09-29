"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { AvisoErro } from "@/components/aviso-erro";
import { CampoSelecao } from "@/components/campo-selecao";
import { CampoTexto } from "@/components/campo-texto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { criarRascunho } from "@/features/documentos/actions";
import { TAMANHO_MAXIMO } from "@/features/documentos/arquivo-limites";
import type { OpcoesDePublicacao, TipoDocumento } from "@/features/documentos/queries";
import {
  esquemaFormularioRascunho,
  MAX_PUBLICOS,
  type EntradaRascunho,
  type FormularioRascunho,
} from "@/features/documentos/schemas";
import { formatarCpf } from "@/lib/cpf-cnpj";

/**
 * Novo documento (F3.1): tipo, título, para quem, e o PDF.
 *
 * Salva como **rascunho**. Publicar é outro passo, no detalhe, depois de
 * conferir a prévia do arquivo e o número de pessoas alcançadas — e é lá que
 * o prazo de ciência é definido, porque ele conta da data de publicação, não
 * da data do upload.
 */

const VAZIO: FormularioRascunho = {
  tipo_id: "",
  titulo: "",
  descricao: "",
  escopo: "individual",
  pessoa_id: "",
  publicos: [{ contrato_id: "", unidade_id: "", funcao: "" }],
};

function descricaoDoTipo(tipo: TipoDocumento | undefined): string | undefined {
  if (!tipo) return undefined;
  const partes = [
    tipo.exige_ciencia
      ? `Pede ciência — prazo padrão de ${tipo.prazo_ciencia_dias ?? "—"} dias corridos, ajustável ao publicar.`
      : "Não pede ciência: o funcionário só recebe e baixa.",
  ];
  if (tipo.exige_2fa) partes.push("Para abrir, exige código de uso único.");
  if (tipo.validade === "por_pessoa") {
    partes.push("Vence: ao publicar, informe até quando vale. O mais novo da pessoa substitui o anterior.");
  } else if (tipo.validade === "por_titulo") {
    partes.push("Vence: ao publicar, informe até quando vale. Para renovar, repita o mesmo título.");
  }
  return partes.join(" ");
}

export function FormularioDocumento({ opcoes }: { opcoes: OpcoesDePublicacao }) {
  const router = useRouter();
  const campoArquivo = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormularioRascunho, unknown, EntradaRascunho>({
    resolver: zodResolver(esquemaFormularioRascunho),
    defaultValues: VAZIO,
  });

  const publicos = useFieldArray({ control, name: "publicos" });
  const [tipoId, escopo, valoresPublicos] = useWatch({
    control,
    name: ["tipo_id", "escopo", "publicos"],
  });
  const tipo = opcoes.tipos.find((t) => t.id === tipoId);

  function escolherArquivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const escolhido = evento.target.files?.[0] ?? null;
    setErroArquivo(null);
    // Conferência de conveniência; a que vale é a do servidor, pelo conteúdo.
    if (escolhido && escolhido.size > TAMANHO_MAXIMO) {
      setErroArquivo("O arquivo passa de 7 MB. Reduza o PDF e envie de novo.");
      setArquivo(null);
      return;
    }
    setArquivo(escolhido);
  }

  async function enviar(entrada: EntradaRascunho) {
    setErroGeral(null);
    if (!arquivo) {
      setErroArquivo("Escolha o arquivo PDF do documento.");
      return;
    }

    const formData = new FormData();
    formData.append("dados", JSON.stringify(entrada));
    formData.append("arquivo", arquivo);

    const resultado = await criarRascunho(formData);
    if (!resultado.ok) {
      setErroGeral(resultado.erro);
      return;
    }
    toast.success("Rascunho salvo. Confira a prévia e publique.");
    router.push(`/admin/documentos/${resultado.dados.id}`);
  }

  // Erro de nível de lista (ex.: nenhum público) chega em `root` ou na própria chave.
  const erroPublicos = errors.publicos?.message ?? errors.publicos?.root?.message;

  return (
    <form onSubmit={handleSubmit(enviar)} className="grid max-w-2xl gap-4" noValidate>
      <AvisoErro mensagem={erroGeral} />

      <Controller
        control={control}
        name="tipo_id"
        render={({ field }) => (
          <CampoSelecao
            rotulo="Tipo de documento"
            opcoes={opcoes.tipos.map((t) => ({ id: t.id, nome: t.nome }))}
            valor={field.value}
            aoMudar={field.onChange}
            erro={errors.tipo_id?.message}
            dica={descricaoDoTipo(tipo)}
          />
        )}
      />

      <CampoTexto rotulo="Título" erro={errors.titulo?.message} {...register("titulo")} />

      <div className="grid gap-1.5">
        <Label htmlFor="descricao">Descrição (opcional)</Label>
        <Textarea id="descricao" rows={3} {...register("descricao")} />
        <p aria-live="polite" className="min-h-5 text-sm text-erro">
          {errors.descricao?.message}
        </p>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Para quem</legend>
        <div className="flex flex-wrap gap-4">
          {(
            [
              ["individual", "Uma pessoa"],
              ["coletivo", "Um grupo — por contrato, unidade e/ou função"],
            ] as const
          ).map(([valor, rotulo]) => (
            <label key={valor} className="flex min-h-11 items-center gap-2 text-sm">
              <input type="radio" value={valor} className="size-4 accent-acao" {...register("escopo")} />
              {rotulo}
            </label>
          ))}
        </div>
      </fieldset>

      {escopo === "individual" ? (
        <Controller
          control={control}
          name="pessoa_id"
          render={({ field }) => (
            <SeletorDePessoa
              pessoas={opcoes.pessoas}
              valor={field.value}
              aoMudar={field.onChange}
              erro={errors.pessoa_id?.message}
            />
          )}
        />
      ) : (
        <div className="grid gap-3">
          <p className="text-sm text-texto-suave">
            Os campos de um mesmo público se somam (“porteiros da unidade X”). Públicos
            diferentes somam pessoas. Só alcança quem tem alocação vigente.
          </p>
          {publicos.fields.map((campo, indice) => {
            const contrato = opcoes.contratos.find(
              (c) => c.id === valoresPublicos?.[indice]?.contrato_id,
            );
            const unidades = contrato
              ? contrato.unidades
              : opcoes.contratos
                  .flatMap((c) => c.unidades)
                  .filter((u, i, todas) => todas.findIndex((x) => x.id === u.id) === i);
            const erroLinha = errors.publicos?.[indice];

            return (
              <fieldset key={campo.id} className="grid gap-2 rounded-lg border border-borda p-3">
                <legend className="px-1 text-sm font-medium">Público {indice + 1}</legend>
                <div className="grid gap-x-3 sm:grid-cols-3">
                  <Controller
                    control={control}
                    name={`publicos.${indice}.contrato_id`}
                    render={({ field }) => (
                      <CampoSelecao
                        rotulo="Contrato"
                        opcoes={opcoes.contratos.map((c) => ({
                          id: c.id,
                          nome: `${c.numero} · ${c.contratante_nome}`,
                        }))}
                        valor={field.value}
                        aoMudar={(v) => {
                          field.onChange(v);
                          // Unidade de outro contrato deixaria o público vazio.
                          setValue(`publicos.${indice}.unidade_id`, "");
                        }}
                        placeholder="Qualquer"
                      />
                    )}
                  />
                  <Controller
                    control={control}
                    name={`publicos.${indice}.unidade_id`}
                    render={({ field }) => (
                      <CampoSelecao
                        rotulo="Unidade"
                        opcoes={unidades}
                        valor={field.value}
                        aoMudar={field.onChange}
                        placeholder="Qualquer"
                      />
                    )}
                  />
                  <Controller
                    control={control}
                    name={`publicos.${indice}.funcao`}
                    render={({ field }) => (
                      <CampoSelecao
                        rotulo="Função"
                        opcoes={opcoes.funcoes.map((f) => ({ id: f, nome: f }))}
                        valor={field.value}
                        aoMudar={field.onChange}
                        placeholder="Qualquer"
                      />
                    )}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p aria-live="polite" className="text-sm text-erro">
                    {erroLinha?.message ?? erroLinha?.root?.message}
                  </p>
                  {publicos.fields.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => publicos.remove(indice)}
                    >
                      <Trash2 aria-hidden strokeWidth={1.5} />
                      Remover público
                    </Button>
                  ) : null}
                </div>
              </fieldset>
            );
          })}
          <p aria-live="polite" className="text-sm text-erro">
            {erroPublicos}
          </p>
          {publicos.fields.length < MAX_PUBLICOS ? (
            <Button
              type="button"
              variant="outline"
              className="justify-self-start"
              onClick={() => publicos.append({ contrato_id: "", unidade_id: "", funcao: "" })}
            >
              <Plus aria-hidden strokeWidth={1.5} />
              Adicionar público
            </Button>
          ) : null}
        </div>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="arquivo">Arquivo PDF</Label>
        <p className="text-sm text-texto-suave">Até 7 MB. O Portal guarda a impressão digital (sha256) do arquivo.</p>
        <Input
          ref={campoArquivo}
          id="arquivo"
          type="file"
          accept="application/pdf,.pdf"
          onChange={escolherArquivo}
          aria-invalid={erroArquivo ? true : undefined}
          className="h-11 py-2"
        />
        <p aria-live="polite" className="min-h-5 text-sm text-erro">
          {erroArquivo}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Salvando…" : "Salvar rascunho"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/admin/documentos")}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/**
 * Escolha de uma pessoa entre centenas: busca por nome ou CPF e mostra as
 * primeiras correspondências. Um select com o quadro inteiro seria inusável.
 */
function SeletorDePessoa({
  pessoas,
  valor,
  aoMudar,
  erro,
}: {
  pessoas: OpcoesDePublicacao["pessoas"];
  valor: string;
  aoMudar: (id: string) => void;
  erro?: string;
}) {
  const [busca, setBusca] = useState("");
  const escolhida = pessoas.find((p) => p.id === valor);

  const encontradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    const digitos = termo.replace(/\D/g, "");
    if (!termo) return [];
    return pessoas
      .filter(
        (p) =>
          p.nome.toLocaleLowerCase("pt-BR").includes(termo) ||
          (digitos.length >= 3 && p.cpf.includes(digitos)),
      )
      .slice(0, 8);
  }, [busca, pessoas]);

  if (escolhida) {
    return (
      <div className="grid gap-1.5">
        <span className="text-sm font-medium">Pessoa</span>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-borda px-3 py-2">
          <span>
            {escolhida.nome}{" "}
            <span className="text-sm text-texto-suave tabular-nums">
              · CPF {formatarCpf(escolhida.cpf)}
            </span>
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => aoMudar("")}>
            Trocar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-1.5">
      <CampoTexto
        rotulo="Pessoa"
        dica="Busque por nome ou CPF."
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        erro={erro}
        autoComplete="off"
      />
      {busca.trim() ? (
        encontradas.length ? (
          <ul className="-mt-4 divide-y divide-borda rounded-lg border border-borda">
            {encontradas.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => aoMudar(p.id)}
                  className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left text-sm hover:bg-fundo-alt"
                >
                  <span>{p.nome}</span>
                  <span className="text-texto-suave tabular-nums">{formatarCpf(p.cpf)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="-mt-4 text-sm text-texto-suave">
            Ninguém ativo com esse nome ou CPF no seu alcance.
          </p>
        )
      ) : null}
    </div>
  );
}
