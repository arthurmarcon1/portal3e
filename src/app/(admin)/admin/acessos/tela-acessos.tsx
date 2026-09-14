"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { BadgeStatus } from "@/components/badge-status";
import { DialogoConfirmacao } from "@/components/dialogo-confirmacao";
import { MenuLinha } from "@/components/menu-linha";
import { FiltroSelecao, TODOS } from "@/components/tabela/filtro-selecao";
import { FiltroSituacao, useFiltroSituacao } from "@/components/tabela/filtro-situacao";
import { criarColunas, TabelaDados, type ColunaDe } from "@/components/tabela/tabela-dados";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { alterarSituacaoDoUsuario } from "@/features/acessos/actions";
import type {
  Perfil,
  PessoaSemUsuario,
  UsuarioAcesso,
} from "@/features/acessos/queries";

import { FormularioUsuario } from "./formulario-usuario";
import { PainelDeAcesso } from "./painel-de-acesso";

const helper = criarColunas<UsuarioAcesso>();

const TIPOS: Record<string, string> = {
  interno: "Equipe 3e",
  contratante: "Contratante",
  funcionario: "Funcionário",
};

export type OpcoesEscopo = {
  contratos: { id: string; nome: string }[];
  unidades: { id: string; nome: string }[];
};

export function TelaAcessos({
  usuarios,
  perfis,
  pessoasSemUsuario,
  opcoesEscopo,
  podeCriar,
  podeEditar,
}: {
  usuarios: UsuarioAcesso[];
  perfis: Perfil[];
  pessoasSemUsuario: PessoaSemUsuario[];
  opcoesEscopo: OpcoesEscopo;
  podeCriar: boolean;
  podeEditar: boolean;
}) {
  const [criando, setCriando] = useState(false);
  const [emPainel, setEmPainel] = useState<UsuarioAcesso | null>(null);
  const [paraDesativar, setParaDesativar] = useState<UsuarioAcesso | null>(null);
  const [tipo, setTipo] = useState(TODOS);
  const { situacao, setSituacao, aplicar } = useFiltroSituacao();

  const visiveis = useMemo(() => {
    const porSituacao = aplicar(usuarios);
    return tipo === TODOS ? porSituacao : porSituacao.filter((u) => u.tipo === tipo);
  }, [aplicar, usuarios, tipo]);

  const colunas = useMemo<ColunaDe<UsuarioAcesso>[]>(
    () =>
      helper.columns([
        helper.accessor("nome", {
          header: "Nome",
          cell: (ctx) => (
            <div>
              <span className="font-medium">{ctx.getValue()}</span>
              <span className="block text-xs break-all text-texto-suave">
                {ctx.row.original.email_login}
              </span>
            </div>
          ),
        }),
        helper.accessor("tipo", {
          header: "Tipo",
          cell: (ctx) => TIPOS[ctx.getValue()] ?? ctx.getValue(),
        }),
        helper.display({
          id: "perfis",
          header: "Perfis",
          cell: (ctx) => {
            const { perfis: doUsuario, tipo: tipoUsuario } = ctx.row.original;
            if (tipoUsuario === "funcionario") {
              // docs/02: funcionário não usa a tabela de perfis. O acesso dele
              // é fixo e sempre restrito ao próprio pessoa_id.
              return <span className="text-texto-suave">Acesso próprio</span>;
            }
            if (doUsuario.length === 0) {
              return <span className="text-alerta">Sem perfil</span>;
            }
            return doUsuario.map((p) => p.nome).join(", ");
          },
        }),
        helper.display({
          id: "escopo",
          header: "Escopo",
          cell: (ctx) => {
            const { escopo, tipo: tipoUsuario } = ctx.row.original;
            if (tipoUsuario === "funcionario") {
              return <span className="text-texto-suave">—</span>;
            }

            const partes = [
              ...escopo.contratos.map((c) => c.numero),
              ...escopo.unidades.map((u) => u.nome),
            ];

            if (partes.length === 0) {
              // Escopo vazio significa o oposto conforme o tipo — docs/03,
              // decisão 5. A tela diz qual dos dois, porque confundir os dois
              // é como se dá acesso demais sem perceber.
              return tipoUsuario === "interno" ? (
                <span>Toda a organização</span>
              ) : (
                <span className="text-alerta">Nada (sem escopo)</span>
              );
            }

            return partes.length <= 2
              ? partes.join(", ")
              : `${partes[0]} e mais ${partes.length - 1}`;
          },
        }),
        helper.accessor("status", {
          header: "Situação",
          cell: (ctx) => (
            <div className="flex flex-col items-end gap-0.5">
              <BadgeStatus status={ctx.getValue()} />
              {ctx.row.original.precisa_trocar_senha && ctx.getValue() === "ativo" ? (
                <span className="text-xs text-texto-suave">senha provisória</span>
              ) : null}
            </div>
          ),
        }),
        helper.display({
          id: "acoes",
          header: () => <span className="sr-only">Ações</span>,
          cell: (ctx) => {
            const linha = ctx.row.original;
            if (!podeEditar) return null;
            return (
              <MenuLinha>
                {linha.tipo === "funcionario" ? null : (
                  <DropdownMenuItem onSelect={() => setEmPainel(linha)}>
                    Perfis e escopo
                  </DropdownMenuItem>
                )}
                {linha.status === "ativo" ? (
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setParaDesativar(linha)}
                  >
                    Desativar acesso
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onSelect={async () => {
                      const r = await alterarSituacaoDoUsuario({
                        usuario_id: linha.id,
                        status: "ativo",
                      });
                      if (r.ok) toast.success(`Acesso de ${linha.nome} reativado.`);
                      else toast.error(r.erro);
                    }}
                  >
                    Reativar acesso
                  </DropdownMenuItem>
                )}
              </MenuLinha>
            );
          },
        }),
      ]) as ColunaDe<UsuarioAcesso>[],
    [podeEditar],
  );

  return (
    <>
      <TabelaDados
        colunas={colunas}
        dados={visiveis}
        camposDeBusca={(u) =>
          `${u.nome} ${u.email_login} ${u.perfis.map((p) => p.nome).join(" ")}`
        }
        rotuloBusca="Buscar por nome ou e-mail"
        substantivo={["usuário", "usuários"]}
        filtros={
          <>
            <FiltroSelecao
              rotulo="Tipo"
              opcoes={[
                { id: "interno", nome: "Equipe 3e" },
                { id: "contratante", nome: "Contratante" },
                { id: "funcionario", nome: "Funcionário" },
              ]}
              valor={tipo}
              aoMudar={setTipo}
              largura="w-40"
            />
            <FiltroSituacao valor={situacao} aoMudar={setSituacao} />
          </>
        }
        acao={
          podeCriar ? (
            <Button type="button" onClick={() => setCriando(true)}>
              <Plus aria-hidden strokeWidth={1.5} />
              Novo acesso
            </Button>
          ) : undefined
        }
        vazio={{
          titulo: "Nenhum acesso cadastrado ainda.",
          descricao:
            "Cadastre quem vai entrar no Portal: a equipe da 3e, os responsáveis do cliente e os funcionários.",
        }}
      />

      {/* Montados só enquanto abertos: remontar devolve o estado inicial,
          que é o que dispensa efeito de "limpar ao abrir". */}
      {criando ? (
        <FormularioUsuario
          perfis={perfis}
          pessoas={pessoasSemUsuario}
          opcoesEscopo={opcoesEscopo}
          aoFechar={() => setCriando(false)}
        />
      ) : null}

      {emPainel ? (
        <PainelDeAcesso
          key={emPainel.id}
          usuario={emPainel}
          perfis={perfis}
          opcoesEscopo={opcoesEscopo}
          aoFechar={() => setEmPainel(null)}
        />
      ) : null}

      <DialogoConfirmacao
        aberto={paraDesativar !== null}
        aoFechar={() => setParaDesativar(null)}
        titulo="Desativar acesso"
        descricao={
          <>
            <strong>{paraDesativar?.nome}</strong> deixa de entrar no Portal na hora. O
            usuário não é excluído: as ciências, os downloads e a auditoria dele
            continuam ligados a este cadastro.
          </>
        }
        rotuloAcao="Desativar acesso"
        aoConfirmar={async () => {
          if (!paraDesativar) return;
          const r = await alterarSituacaoDoUsuario({
            usuario_id: paraDesativar.id,
            status: "inativo",
          });
          if (r.ok) {
            toast.success(`Acesso de ${paraDesativar.nome} desativado.`);
            setParaDesativar(null);
          } else {
            toast.error(r.erro);
          }
        }}
      />
    </>
  );
}
