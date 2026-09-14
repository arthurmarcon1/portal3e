"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CampoSelecao } from "@/components/campo-selecao";
import { CampoTexto } from "@/components/campo-texto";
import { ListaDeMarcacao } from "@/components/lista-de-marcacao";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { criarUsuario, type UsuarioCriado } from "@/features/acessos/actions";
import type { Perfil, PessoaSemUsuario } from "@/features/acessos/queries";
import { formatarCpf } from "@/lib/cpf-cnpj";

import type { OpcoesEscopo } from "./tela-acessos";

/**
 * Criação de acesso.
 *
 * Três tipos, três formulários diferentes: funcionário entra pelo CPF de uma
 * pessoa já cadastrada e não recebe perfil (docs/02 — o acesso dele é fixo,
 * sempre o próprio `pessoa_id`); interno e contratante entram por e-mail real
 * e precisam de perfil.
 *
 * O react-hook-form ficou de fora aqui de propósito: o formulário troca de
 * forma conforme o tipo, e a união discriminada do Zod não casa bem com um
 * `useForm` só. O estado é local e a validação que vale é a da Server Action.
 *
 * O componente só existe enquanto o diálogo está aberto: quem controla isso é
 * o pai. É o que dispensa o `useEffect` de "limpar ao abrir" — montar de novo
 * já devolve o estado inicial, e é o padrão que o React recomenda no lugar de
 * sincronizar estado com efeito.
 */

type Tipo = "funcionario" | "interno" | "contratante";

const VAZIO = {
  tipo: "interno" as Tipo,
  pessoa_id: "",
  nome: "",
  email: "",
  telefone: "",
  perfis: [] as string[],
  contratos: [] as string[],
  unidades: [] as string[],
};

export function FormularioUsuario({
  perfis,
  pessoas,
  opcoesEscopo,
  aoFechar,
}: {
  perfis: Perfil[];
  pessoas: PessoaSemUsuario[];
  opcoesEscopo: OpcoesEscopo;
  aoFechar: () => void;
}) {
  const [form, setForm] = useState(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [criado, setCriado] = useState<UsuarioCriado | null>(null);

  const mudar = <C extends keyof typeof VAZIO>(campo: C, valor: (typeof VAZIO)[C]) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  // Perfil serve a um tipo de usuário só — `perfis.aplica_a`.
  const perfisDoTipo = perfis.filter((p) => p.aplica_a === form.tipo);

  async function enviar() {
    setSalvando(true);

    const entrada =
      form.tipo === "funcionario"
        ? { tipo: "funcionario" as const, pessoa_id: form.pessoa_id }
        : {
            tipo: form.tipo,
            nome: form.nome,
            email: form.email,
            telefone: form.telefone,
            perfis: form.perfis,
            escopo: { contratos: form.contratos, unidades: form.unidades },
          };

    const resultado = await criarUsuario(entrada);
    setSalvando(false);

    if (!resultado.ok) {
      toast.error(resultado.erro);
      return;
    }
    setCriado(resultado.dados);
    toast.success("Acesso criado.");
  }

  // ------------------------------------------------------------------
  // Depois de criar: a senha provisória aparece UMA vez
  // ------------------------------------------------------------------
  if (criado) {
    return (
      <Dialog open onOpenChange={(v) => !v && aoFechar()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Acesso criado</DialogTitle>
            <DialogDescription>
              Anote a senha provisória agora. Ela não é guardada em lugar nenhum e não
              aparece de novo — se perder, gere outra desativando e recriando o acesso.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            <div className="grid gap-1 rounded-lg border border-borda bg-fundo-alt px-4 py-3">
              <span className="text-xs text-texto-suave">Entra com</span>
              <span className="break-all">{criado.emailLogin}</span>
            </div>
            <div className="grid gap-1 rounded-lg border border-borda bg-fundo-alt px-4 py-3">
              <span className="text-xs text-texto-suave">Senha provisória</span>
              <span className="font-mono text-xl tracking-wide tabular-nums">
                {criado.senhaProvisoria}
              </span>
            </div>
            <p className="text-sm text-texto-suave">
              {criado.nome} vai ter que trocar a senha no primeiro acesso.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(criado.senhaProvisoria);
                  toast.success("Senha copiada.");
                } catch {
                  toast.error("Não foi possível copiar. Anote a senha da tela.");
                }
              }}
            >
              <Copy aria-hidden strokeWidth={1.5} />
              Copiar senha
            </Button>
            <Button type="button" onClick={aoFechar}>
              <Check aria-hidden strokeWidth={1.5} />
              Anotei
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ------------------------------------------------------------------
  // Formulário
  // ------------------------------------------------------------------
  const podeEnviar =
    form.tipo === "funcionario"
      ? form.pessoa_id !== ""
      : form.nome.trim() !== "" && form.email.trim() !== "" && form.perfis.length > 0;

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo acesso</DialogTitle>
          <DialogDescription>
            Quem vai entrar no Portal e com que alcance.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 py-4">
          <CampoSelecao
            rotulo="Tipo de usuário"
            opcoes={[
              { id: "interno", nome: "Equipe 3e" },
              { id: "contratante", nome: "Contratante" },
              { id: "funcionario", nome: "Funcionário" },
            ]}
            valor={form.tipo}
            aoMudar={(v) =>
              // Trocar de tipo invalida perfil e escopo escolhidos.
              setForm({ ...VAZIO, tipo: v as Tipo })
            }
          />

          {form.tipo === "funcionario" ? (
            <>
              <CampoSelecao
                rotulo="Pessoa"
                dica="O login é o CPF. Só aparecem pessoas ativas que ainda não têm acesso."
                opcoes={pessoas.map((p) => ({
                  id: p.id,
                  nome: `${p.nome} · ${formatarCpf(p.cpf)}`,
                }))}
                valor={form.pessoa_id}
                aoMudar={(v) => mudar("pessoa_id", v)}
                placeholder={
                  pessoas.length === 0
                    ? "Todas as pessoas ativas já têm acesso"
                    : "Selecione…"
                }
                desabilitado={pessoas.length === 0}
              />
              <p className="text-sm text-texto-suave">
                Funcionário não recebe perfil nem escopo: o acesso dele é fixo e alcança
                somente o próprio cadastro e os próprios documentos.
              </p>
            </>
          ) : (
            <>
              <CampoTexto
                rotulo="Nome"
                value={form.nome}
                onChange={(e) => mudar("nome", e.target.value)}
              />
              <CampoTexto
                rotulo="E-mail"
                type="email"
                dica="É por ele que a pessoa entra e recebe aviso do Portal."
                value={form.email}
                onChange={(e) => mudar("email", e.target.value)}
              />
              <CampoTexto
                rotulo="Telefone"
                inputMode="tel"
                value={form.telefone}
                onChange={(e) => mudar("telefone", e.target.value)}
              />

              <ListaDeMarcacao
                legenda="Perfis"
                dica="O que a pessoa pode fazer. Pode ter mais de um."
                opcoes={perfisDoTipo.map((p) => ({ id: p.id, nome: p.nome }))}
                marcadas={form.perfis}
                aoMudar={(v) => mudar("perfis", v)}
                vazio="Nenhum perfil cadastrado para este tipo de usuário."
              />

              <ListaDeMarcacao
                legenda="Contratos do escopo"
                opcoes={opcoesEscopo.contratos}
                marcadas={form.contratos}
                aoMudar={(v) => mudar("contratos", v)}
                vazio="Nenhum contrato ativo."
              />

              <ListaDeMarcacao
                legenda="Unidades do escopo"
                opcoes={opcoesEscopo.unidades}
                marcadas={form.unidades}
                aoMudar={(v) => mudar("unidades", v)}
                vazio="Nenhuma unidade ativa."
              />

              <AvisoDeEscopo
                tipo={form.tipo}
                vazio={form.contratos.length === 0 && form.unidades.length === 0}
              />
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="button" onClick={enviar} disabled={salvando || !podeEnviar}>
            {salvando ? "Criando…" : "Criar acesso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Escopo vazio significa o OPOSTO conforme o tipo (docs/03, decisão 5), e é o
 * tipo de detalhe que se esquece na hora de cadastrar. A tela diz na cara.
 */
export function AvisoDeEscopo({ tipo, vazio }: { tipo: string; vazio: boolean }) {
  if (!vazio) return null;

  return tipo === "interno" ? (
    <p className="text-sm text-texto-suave">
      Sem contrato nem unidade marcados, esta pessoa da equipe alcança{" "}
      <strong className="text-texto">toda a organização</strong>. É o padrão de quem
      trabalha com o quadro inteiro.
    </p>
  ) : (
    <p className="text-sm text-alerta">
      Sem contrato nem unidade marcados, este usuário do contratante{" "}
      <strong>não enxerga absolutamente nada</strong>. Marque pelo menos um.
    </p>
  );
}
