import type { Metadata } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Briefcase,
  CalendarCheck,
  ChevronRight,
  FilePlus2,
  HardHat,
  Inbox,
  ScrollText,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";

import { BarraProgresso } from "@/components/barra-progresso";
import { formatarData } from "@/features/documentos/formato";
import { hojeEmBrasilia } from "@/features/documentos/funcionario";
import {
  campanhasDeCiencia,
  contarRascunhos,
  filaDeCiencia,
  filaDeSolicitacoes,
  ultimoFechamento,
  type ProgressoDeCampanha,
} from "@/features/inicio/queries";
import { dataPorExtenso, plural, saudacao } from "@/features/inicio/saudacao";
import { painelDeConformidade } from "@/features/sst/queries";
import { temPermissao } from "@/lib/auth/sessao";
import { paginaProtegida } from "@/lib/auth/pagina-protegida";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Início · Portal 3e" };

/** Quantas campanhas de ciência o início acompanha; o resto está no relatório. */
const CAMPANHAS = 4;

type Contador = {
  valor: number;
  rotulo: readonly [string, string];
  href: string;
  /** Pede ação quando passa de zero — o número ganha a cor de alerta, sempre com o rótulo. */
  alerta?: boolean;
};

type Grupo = { titulo: string; contadores: Contador[] };

type Atalho = { href: string; titulo: string; descricao: string; icone: LucideIcon };

/**
 * Início da equipe interna: o que pede atenção, o andamento da ciência e o
 * caminho para onde a pessoa vai trabalhar.
 *
 * Cada bloco aparece conforme o perfil — é filtro de tela; quem barra é
 * `paginaProtegida` em cada destino e a RLS em cada número. Dentro de um
 * bloco, **número zerado não some**: "0 solicitações vencidas" é informação,
 * e o bloco desaparecido parece defeito.
 *
 * Todo contador abre a tela de destino **já no recorte que ele conta**
 * (`?responsavel=comigo`, `?situacao=vencidas`...), não a tela genérica.
 */
export default paginaProtegida(
  { tipo: "interno" },
  async function PaginaAdmin(_props, usuario) {
    const hoje = hojeEmBrasilia();
    const [
      vePessoas,
      criaPessoas,
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
      temPermissao("pessoas", "criar"),
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
    // O relatório de pendências pede as duas (docs/05, F5.3) — o contador leva até ele.
    const acompanhaCiencia = veDocumentos && veRelatorios;

    const [solicitacoes, ciencia, rascunhos, sst, campanhas, fechamento] = await Promise.all([
      veSolicitacoes ? filaDeSolicitacoes(usuario.id, hoje) : null,
      acompanhaCiencia ? filaDeCiencia(hoje) : null,
      criaDocumentos ? contarRascunhos() : null,
      veSst ? painelDeConformidade() : null,
      acompanhaCiencia ? campanhasDeCiencia(CAMPANHAS) : null,
      publicaEspelhos ? ultimoFechamento() : null,
    ]);

    const grupos: Grupo[] = [];
    if (solicitacoes) {
      grupos.push({
        titulo: "Solicitações",
        contadores: [
          ...(editaSolicitacoes
            ? [
                {
                  valor: solicitacoes.comVoce,
                  rotulo: ["em aberto com você", "em aberto com você"] as const,
                  href: "/admin/solicitacoes?responsavel=comigo",
                },
              ]
            : []),
          {
            valor: solicitacoes.semResponsavel,
            rotulo: ["sem responsável", "sem responsável"],
            href: "/admin/solicitacoes?responsavel=sem",
            alerta: true,
          },
          {
            valor: solicitacoes.vencidas,
            rotulo: ["solicitação vencida", "solicitações vencidas"],
            href: "/admin/solicitacoes?prazo=vencidas",
            alerta: true,
          },
        ],
      });
    }
    if (ciencia) {
      grupos.push({
        titulo: "Ciência",
        contadores: [
          {
            valor: ciencia.pendentes,
            rotulo: ["ciência pendente", "ciências pendentes"],
            href: "/admin/relatorios/pendencias",
          },
          {
            valor: ciencia.vencidas,
            rotulo: ["ciência vencida", "ciências vencidas"],
            href: "/admin/relatorios/pendencias?situacao=vencidas",
            alerta: true,
          },
        ],
      });
    }
    if (rascunhos !== null) {
      grupos.push({
        titulo: "Documentos",
        contadores: [
          {
            valor: rascunhos,
            rotulo: ["rascunho a publicar", "rascunhos a publicar"],
            href: "/admin/documentos?situacao=rascunho",
          },
        ],
      });
    }
    if (sst) {
      grupos.push({
        titulo: "SST",
        contadores: [
          {
            valor: sst.filter((l) => l.situacao === "vencido").length,
            rotulo: ["ASO ou treinamento vencido", "ASOs e treinamentos vencidos"],
            href: "/admin/sst?situacao=vencido",
            alerta: true,
          },
          {
            valor: sst.filter((l) => l.situacao === "a_vencer").length,
            rotulo: ["vence em até 30 dias", "vencem em até 30 dias"],
            href: "/admin/sst?situacao=a_vencer",
          },
        ],
      });
    }
    const nadaPendente = grupos.every((g) => g.contadores.every((c) => c.valor === 0));

    const atalhos: Atalho[] = [];
    if (criaDocumentos) {
      atalhos.push({
        href: "/admin/documentos/novo",
        titulo: "Novo documento",
        descricao: "Comunicado, norma ou treinamento, com prévia antes de publicar.",
        icone: FilePlus2,
      });
    }
    if (publicaEspelhos) {
      atalhos.push({
        href: "/admin/jornada/publicar",
        titulo: "Publicar espelhos",
        descricao: fechamento
          ? `Último fechamento publicado: ${competencia(fechamento)}.`
          : "Nenhum fechamento publicado ainda.",
        icone: CalendarCheck,
      });
    }
    if (veSolicitacoes) {
      atalhos.push({
        href: "/admin/solicitacoes",
        titulo: "Caixa de solicitações",
        descricao: "Pedidos de funcionários e contratantes, e divergências de ciência.",
        icone: Inbox,
      });
    }
    if (criaPessoas) {
      atalhos.push({
        href: "/admin/pessoas/importar",
        titulo: "Importar pessoas",
        descricao: "Planilha do quadro, com conferência antes de gravar.",
        icone: Upload,
      });
    } else if (vePessoas) {
      atalhos.push({ href: "/admin/pessoas", titulo: "Pessoas", descricao: "Quadro, fichas e alocações.", icone: Users });
    }
    if (veSst) {
      atalhos.push({ href: "/admin/sst", titulo: "SST", descricao: "ASO e treinamentos por vencimento.", icone: HardHat });
    }
    if (veRelatorios) {
      atalhos.push({
        href: "/admin/relatorios",
        titulo: "Relatórios",
        descricao: "Pendências, ciências, solicitações e quadro, com exportação.",
        icone: BarChart3,
      });
    }
    if (veContratos) {
      atalhos.push({
        href: "/admin/contratos",
        titulo: "Contratos",
        descricao: "Contratantes, contratos e unidades.",
        icone: Briefcase,
      });
    }
    if (veAdministracao) {
      atalhos.push(
        { href: "/admin/acessos", titulo: "Acessos", descricao: "Usuários, perfis e escopos.", icone: ShieldCheck },
        { href: "/admin/auditoria", titulo: "Auditoria", descricao: "Quem fez o quê, e quando.", icone: ScrollText },
      );
    }

    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <h1 className="text-xl">
          {saudacao()}, {usuario.nome.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-texto-suave">
          {dataPorExtenso()}
          {grupos.length > 0 && nadaPendente ? " · Nada aguardando você hoje." : ""}
        </p>

        {grupos.length > 0 ? (
          <section aria-labelledby="fila" className="mt-6">
            <h2 id="fila" className="text-lg">
              Sua fila
            </h2>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {grupos.map((g) => (
                <div key={g.titulo}>
                  <h3 className="mb-2 text-sm text-texto-suave">{g.titulo}</h3>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {g.contadores.map((c) => (
                      <li key={c.href}>
                        <CartaoContador contador={c} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {campanhas ? <CienciaEmAndamento campanhas={campanhas} /> : null}

        {atalhos.length > 0 ? (
          <section aria-labelledby="atalhos" className="mt-8">
            <h2 id="atalhos" className="text-lg">
              Atalhos
            </h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {atalhos.map((a) => (
                <li key={a.href}>
                  <Link
                    href={a.href}
                    className="flex h-full items-start gap-3 rounded-lg border border-borda px-4 py-3 hover:bg-fundo-alt"
                  >
                    <a.icone aria-hidden strokeWidth={1.5} className="mt-0.5 size-5 shrink-0 text-acao" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{a.titulo}</span>
                      <span className="block text-sm text-texto-suave">{a.descricao}</span>
                    </span>
                    <ChevronRight aria-hidden strokeWidth={1.5} className="mt-0.5 size-5 shrink-0 text-texto-suave" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    );
  },
);

function CartaoContador({ contador: c }: { contador: Contador }) {
  const atencao = c.alerta && c.valor > 0;
  return (
    <Link
      href={c.href}
      className="flex h-full items-center justify-between gap-2 rounded-lg border border-borda px-4 py-3 hover:bg-fundo-alt"
    >
      <span>
        <span className={cn("block text-2xl tabular-nums", atencao && "text-alerta")}>{c.valor}</span>
        <span className="block text-sm text-texto-suave">{plural(c.valor, c.rotulo)}</span>
      </span>
      <ChevronRight aria-hidden strokeWidth={1.5} className="size-5 shrink-0 text-texto-suave" />
    </Link>
  );
}

function CienciaEmAndamento({ campanhas }: { campanhas: ProgressoDeCampanha[] }) {
  return (
    <section aria-labelledby="andamento" className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="andamento" className="text-lg">
          Ciência em andamento
        </h2>
        <Link href="/admin/relatorios/pendencias" className="text-sm text-acao underline-offset-2 hover:underline">
          Ver todas as pendências
        </Link>
      </div>
      {campanhas.length === 0 ? (
        <p className="mt-2 text-texto-suave">
          Nenhum documento esperando ciência. Quando um comunicado ou espelho for publicado, o andamento aparece aqui.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-borda rounded-lg border border-borda">
          {campanhas.map((c) => (
            <li key={c.chave}>
              <Link
                href={
                  c.escopo === "coletivo"
                    ? `/admin/documentos/${c.documento_id}`
                    : `/admin/documentos?situacao=publicado&tipo=${encodeURIComponent(c.tipo_nome)}`
                }
                className="grid gap-2 px-4 py-3 hover:bg-fundo-alt"
              >
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium">{c.titulo}</span>
                  <span className="text-sm text-texto-suave tabular-nums">
                    {c.tipo_nome}
                    {c.prazo ? ` · prazo ${formatarData(c.prazo)}` : ""}
                  </span>
                </span>
                <BarraProgresso parte={c.respondidos} total={c.total} rotulo={`${c.titulo}: responderam`} />
                <span className="text-sm text-texto-suave tabular-nums">
                  {c.respondidos} de {c.total} responderam · {c.total - c.respondidos}{" "}
                  {plural(c.total - c.respondidos, ["pendente", "pendentes"])}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** "2026-08-01" → "08/2026". */
function competencia(iso: string): string {
  const [ano, mes] = iso.split("-");
  return `${mes}/${ano}`;
}
