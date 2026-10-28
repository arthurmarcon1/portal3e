import type { ReactNode } from "react";

import { BotaoSair } from "@/components/botao-sair";
import { NavLateral, type GrupoNav, type ItemNav } from "@/components/nav-lateral";
import { hojeEmBrasilia } from "@/features/documentos/funcionario";
import { contarRascunhos, filaDeSolicitacoes } from "@/features/inicio/queries";
import { painelDeConformidade } from "@/features/sst/queries";
import { exigirTipo, temPermissao } from "@/lib/auth/sessao";

/**
 * Área da equipe interna da 3e.
 *
 * O `exigirTipo` abaixo protege o que ESTE layout desenha (navegação, nome
 * do usuário, badges). Ele não segura as páginas: no Next 16 o layout não
 * controla se o resto da rota renderiza — os segmentos rodam em paralelo e
 * entram no RSC payload mesmo que o layout redirecione. Quem segura cada
 * página é `paginaProtegida`, que refaz o tipo e checa o módulo antes de a
 * página começar (ver `src/lib/auth/pagina-protegida.tsx`).
 *
 * O proxy (`src/proxy.ts`) é conveniência de roteamento — ele manda a pessoa
 * para a própria área antes de a tela piscar. Some com o proxy inteiro e nada
 * vaza. A documentação do Next diz o mesmo: Proxy é interceptação de
 * requisição, não camada de autorização (e já houve CVE de bypass de
 * middleware).
 *
 * Por último, a RLS, que segura o dado mesmo se as camadas de cima falharem.
 */
export default async function LayoutAdmin({ children }: { children: ReactNode }) {
  const usuario = await exigirTipo("interno");

  const [
    vePessoas,
    veContratos,
    veDocumentos,
    criaDocumentos,
    publicaEspelhos,
    veSolicitacoes,
    editaSolicitacoes,
    veSst,
    veRelatorios,
    veAdministracao,
  ] = await Promise.all([
    temPermissao("pessoas", "ver"),
    temPermissao("contratos", "ver"),
    temPermissao("documentos", "ver"),
    temPermissao("documentos", "criar"),
    temPermissao("jornada", "criar"),
    temPermissao("solicitacoes", "ver"),
    temPermissao("solicitacoes", "editar"),
    temPermissao("sst", "ver"),
    temPermissao("relatorios", "ver"),
    temPermissao("administracao", "ver"),
  ]);

  // Badges: as mesmas consultas dos contadores do início, com o client do
  // usuário (a RLS decide o número). São adorno de menu: se uma falhar, o
  // item aparece sem badge — a navegação nunca cai por causa de um número.
  const [comVoce, rascunhos, sstVencidos] = await Promise.all([
    veSolicitacoes && editaSolicitacoes
      ? semFalhar(filaDeSolicitacoes(usuario.id, hojeEmBrasilia()).then((f) => f.comVoce))
      : null,
    criaDocumentos ? semFalhar(contarRascunhos()) : null,
    veSst
      ? semFalhar(painelDeConformidade().then((l) => l.filter((x) => x.situacao === "vencido").length))
      : null,
  ]);

  // Link que a pessoa não pode abrir não é mostrado. Filtro de UI apenas:
  // quem barra é `paginaProtegida` em cada página. Com badge acima de zero, o
  // item abre a tela já no recorte que ele conta — badge dizendo 2 e lista
  // mostrando 47 sem destaque é pior que badge nenhum.
  const diaADia: ItemNav[] = [];
  if (veSolicitacoes) {
    diaADia.push({
      secao: "/admin/solicitacoes",
      href: comVoce ? "/admin/solicitacoes?responsavel=comigo" : "/admin/solicitacoes",
      rotulo: "Solicitações",
      icone: "solicitacoes",
      contagem: comVoce ? { valor: comVoce, descricao: "em aberto com você" } : undefined,
    });
  }
  if (veDocumentos) {
    diaADia.push({
      secao: "/admin/documentos",
      href: rascunhos ? "/admin/documentos?situacao=rascunho" : "/admin/documentos",
      rotulo: "Documentos",
      icone: "documentos",
      contagem: rascunhos ? { valor: rascunhos, descricao: "rascunhos a publicar" } : undefined,
    });
  }
  if (publicaEspelhos) {
    diaADia.push({ secao: "/admin/jornada", href: "/admin/jornada/publicar", rotulo: "Espelhos", icone: "espelhos" });
  }

  const acompanhamento: ItemNav[] = [];
  if (veRelatorios) {
    acompanhamento.push({ secao: "/admin/relatorios", href: "/admin/relatorios", rotulo: "Relatórios", icone: "relatorios" });
  }
  if (veSst) {
    acompanhamento.push({
      secao: "/admin/sst",
      href: sstVencidos ? "/admin/sst?situacao=vencido" : "/admin/sst",
      rotulo: "SST",
      icone: "sst",
      contagem: sstVencidos
        ? { valor: sstVencidos, descricao: "ASOs e treinamentos vencidos", alerta: true }
        : undefined,
    });
  }

  const cadastro: ItemNav[] = [];
  if (vePessoas) {
    cadastro.push({ secao: "/admin/pessoas", href: "/admin/pessoas", rotulo: "Pessoas", icone: "pessoas" });
  }
  if (veContratos) {
    cadastro.push(
      { secao: "/admin/contratantes", href: "/admin/contratantes", rotulo: "Contratantes", icone: "contratantes" },
      { secao: "/admin/contratos", href: "/admin/contratos", rotulo: "Contratos", icone: "contratos" },
      { secao: "/admin/unidades", href: "/admin/unidades", rotulo: "Unidades", icone: "unidades" },
    );
  }

  const administracao: ItemNav[] = [];
  if (veAdministracao) {
    administracao.push(
      { secao: "/admin/acessos", href: "/admin/acessos", rotulo: "Acessos", icone: "acessos" },
      { secao: "/admin/auditoria", href: "/admin/auditoria", rotulo: "Auditoria", icone: "auditoria" },
    );
  }

  const todos: GrupoNav[] = [
    { titulo: null, itens: [{ secao: "/admin", href: "/admin", rotulo: "Início", icone: "inicio" }] },
    { titulo: "Dia a dia", itens: diaADia },
    { titulo: "Acompanhamento", itens: acompanhamento },
    { titulo: "Cadastro", itens: cadastro },
    { titulo: "Administração", itens: administracao },
  ];
  const grupos = todos.filter((g) => g.itens.length > 0);

  const rodape = (
    <div className="flex items-center justify-between gap-2 px-3">
      <span className="min-w-0 truncate text-sm font-medium">{usuario.nome}</span>
      <BotaoSair />
    </div>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-fundo-pagina lg:flex-row">
      <NavLateral grupos={grupos} rodape={rodape} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

async function semFalhar(consulta: Promise<number>): Promise<number | null> {
  try {
    return await consulta;
  } catch (erro) {
    console.error("[nav] contagem do badge falhou", erro);
    return null;
  }
}
