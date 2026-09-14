"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { alterarPermissoesDoPerfil } from "@/features/acessos/actions";
import type { Perfil } from "@/features/acessos/queries";
import { ACOES, MODULOS } from "@/lib/auth/modulos";

/**
 * Matriz módulo × ação de um perfil, em grade de checkboxes.
 *
 * Os módulos e as ações vêm de `@/lib/auth/sessao` — a mesma lista que
 * `exigirPermissao` usa e que o `check` de `perfil_permissoes` reproduz no
 * banco. Uma terceira cópia aqui divergiria no primeiro módulo novo.
 */

const ROTULO_MODULO: Record<string, string> = {
  pessoas: "Pessoas",
  contratos: "Contratos",
  documentos: "Documentos",
  jornada: "Jornada",
  solicitacoes: "Solicitações",
  comunicacao: "Comunicação",
  sst: "SST",
  relatorios: "Relatórios",
  administracao: "Administração",
};

const ROTULO_ACAO: Record<string, string> = {
  ver: "Ver",
  criar: "Criar",
  editar: "Editar",
  excluir: "Excluir",
  exportar: "Exportar",
};

const TIPOS: Record<string, string> = {
  interno: "Equipe 3e",
  contratante: "Contratante",
  funcionario: "Funcionário",
};

export function TelaPerfis({
  perfis,
  podeEditar,
}: {
  perfis: Perfil[];
  podeEditar: boolean;
}) {
  const [selecionado, setSelecionado] = useState(perfis[0]?.id ?? "");
  const perfil = perfis.find((p) => p.id === selecionado) ?? perfis[0];

  if (!perfil) {
    return (
      <div className="rounded-lg border border-borda bg-fundo-alt px-4 py-10 text-center">
        <p className="font-medium">Nenhum perfil cadastrado.</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-texto-suave">
          Os perfis vêm do seed da organização. Se a lista está vazia, o cadastro
          inicial não foi concluído.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
      <nav aria-label="Perfis" className="overflow-hidden rounded-lg border border-borda">
        <ul className="divide-y divide-borda">
          {perfis.map((p) => {
            const ativo = p.id === perfil.id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelecionado(p.id)}
                  aria-current={ativo ? "true" : undefined}
                  className={`w-full px-3 py-2 text-left text-sm ${
                    ativo ? "bg-fundo-alt font-medium" : "hover:bg-fundo-alt"
                  }`}
                >
                  {p.nome}
                  <span className="block text-xs text-texto-suave">
                    {TIPOS[p.aplica_a] ?? p.aplica_a} ·{" "}
                    {p.usuarios === 1 ? "1 usuário" : `${p.usuarios} usuários`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <GradeDoPerfil key={perfil.id} perfil={perfil} podeEditar={podeEditar} />
    </div>
  );
}

function GradeDoPerfil({
  perfil,
  podeEditar,
}: {
  perfil: Perfil;
  podeEditar: boolean;
}) {
  const [marcadas, setMarcadas] = useState<string[]>(perfil.permissoes);
  const [salvando, setSalvando] = useState(false);

  const mudou = useMemo(() => {
    const a = [...marcadas].sort().join("|");
    const b = [...perfil.permissoes].sort().join("|");
    return a !== b;
  }, [marcadas, perfil.permissoes]);

  function alternar(chave: string, marcada: boolean) {
    setMarcadas((atual) =>
      marcada ? [...atual, chave] : atual.filter((c) => c !== chave),
    );
  }

  async function salvar() {
    setSalvando(true);
    const r = await alterarPermissoesDoPerfil({
      perfil_id: perfil.id,
      permissoes: marcadas,
    });
    setSalvando(false);

    if (r.ok) toast.success(`Permissões de ${perfil.nome} atualizadas.`);
    else toast.error(r.erro);
  }

  return (
    <div className="grid gap-3">
      <div>
        <h2 className="text-base font-medium">{perfil.nome}</h2>
        {perfil.descricao ? (
          <p className="text-sm text-texto-suave">{perfil.descricao}</p>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-lg border border-borda">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Permissões do perfil {perfil.nome}, por módulo e ação
          </caption>
          <thead className="bg-fundo-alt">
            <tr>
              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-texto-suave">
                Módulo
              </th>
              {ACOES.map((acao) => (
                <th
                  key={acao}
                  scope="col"
                  className="px-3 py-2 text-center text-xs font-medium text-texto-suave"
                >
                  {ROTULO_ACAO[acao]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODULOS.map((modulo) => (
              <tr key={modulo} className="border-t border-borda">
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  {ROTULO_MODULO[modulo] ?? modulo}
                </th>
                {ACOES.map((acao) => {
                  const chave = `${modulo}:${acao}`;
                  return (
                    <td key={acao} className="px-3 py-2 text-center">
                      <Checkbox
                        checked={marcadas.includes(chave)}
                        disabled={!podeEditar}
                        onCheckedChange={(v) => alternar(chave, v === true)}
                        aria-label={`${ROTULO_ACAO[acao]} em ${ROTULO_MODULO[modulo] ?? modulo}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {podeEditar ? (
        <div className="flex items-center gap-3">
          <Button type="button" onClick={salvar} disabled={salvando || !mudou}>
            {salvando ? "Salvando…" : "Salvar permissões"}
          </Button>
          {mudou ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setMarcadas(perfil.permissoes)}
              disabled={salvando}
            >
              Descartar
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-texto-suave">
          Você tem acesso de leitura a esta tela. Alterar permissões exige
          administracao:editar.
        </p>
      )}
    </div>
  );
}
