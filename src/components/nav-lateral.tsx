"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Briefcase,
  Building2,
  CalendarCheck,
  FileText,
  HardHat,
  House,
  Inbox,
  MapPin,
  Menu,
  ScrollText,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Ícones por chave: componente não atravessa a fronteira servidor → cliente. */
const ICONES = {
  inicio: House,
  solicitacoes: Inbox,
  documentos: FileText,
  espelhos: CalendarCheck,
  relatorios: BarChart3,
  sst: HardHat,
  pessoas: Users,
  contratantes: Building2,
  contratos: Briefcase,
  unidades: MapPin,
  acessos: ShieldCheck,
  auditoria: ScrollText,
} satisfies Record<string, LucideIcon>;

export type IconeNav = keyof typeof ICONES;

export type ItemNav = {
  /** Raiz da seção: decide o item ativo. */
  secao: string;
  /** Para onde o clique leva — com badge, já no recorte que ele conta. */
  href: string;
  rotulo: string;
  icone: IconeNav;
  /** Badge: só aparece acima de zero (docs/04, "Navegação da equipe"). */
  contagem?: { valor: number; descricao: string; alerta?: boolean };
};

export type GrupoNav = { titulo: string | null; itens: ItemNav[] };

/**
 * Navegação lateral da área interna, agrupada por assunto.
 *
 * Os grupos chegam prontos do servidor, já filtrados por permissão: link que a
 * pessoa não pode abrir não aparece, e grupo sem item some. Isso é
 * conveniência de UI — quem barra de verdade é `paginaProtegida`, em cada
 * página.
 *
 * A partir de 1024px a barra é fixa à esquerda; abaixo, vira um painel aberto
 * pelo botão "Menu" da barra superior.
 */
export function NavLateral({ grupos, rodape }: { grupos: GrupoNav[]; rodape: ReactNode }) {
  const caminho = usePathname();
  // O painel do celular guarda em que rota foi aberto: navegou, ele fecha
  // sozinho, sem efeito para sincronizar.
  const [abertoEm, setAbertoEm] = useState<string | null>(null);
  const aberto = abertoEm === caminho;

  const lista = (
    <nav aria-label="Seções da administração" className="grid gap-5 px-3 py-4">
      {grupos.map((grupo) => (
        <div key={grupo.titulo ?? "raiz"} className="grid gap-0.5">
          {grupo.titulo ? (
            <p className="px-3 pb-1 text-xs font-medium text-texto-suave">{grupo.titulo}</p>
          ) : null}
          <ul className="grid gap-0.5">
            {grupo.itens.map((item) => (
              <li key={item.secao}>
                <ItemLink item={item} ativo={ativoEm(caminho, item.secao)} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Celular e tablet: barra superior com o botão do painel. */}
      <div className="sticky top-0 z-40 border-b border-borda bg-fundo lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          <Link href="/admin" className="inline-flex min-h-11 items-center font-semibold">
            Portal 3e
          </Link>
          <button
            type="button"
            aria-expanded={aberto}
            aria-controls="nav-lateral-painel"
            onClick={() => setAbertoEm(aberto ? null : caminho)}
            className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium hover:bg-fundo-hover"
          >
            {aberto ? (
              <X aria-hidden strokeWidth={1.5} className="size-5" />
            ) : (
              <Menu aria-hidden strokeWidth={1.5} className="size-5" />
            )}
            Menu
          </button>
        </div>
        {aberto ? (
          <div id="nav-lateral-painel" className="max-h-[calc(100dvh-3.75rem)] overflow-y-auto border-t border-borda">
            {lista}
            <div className="border-t border-borda px-3 py-3">{rodape}</div>
          </div>
        ) : null}
      </div>

      {/* Desktop: barra fixa. */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-borda bg-fundo lg:flex">
        <Link href="/admin" className="flex h-16 shrink-0 items-center px-6 text-lg font-semibold">
          Portal 3e
        </Link>
        <div className="min-h-0 flex-1 overflow-y-auto">{lista}</div>
        <div className="shrink-0 border-t border-borda px-3 py-3">{rodape}</div>
      </aside>
    </>
  );
}

function ativoEm(caminho: string, secao: string) {
  if (secao === "/admin") return caminho === "/admin";
  return caminho === secao || caminho.startsWith(`${secao}/`);
}

function ItemLink({ item, ativo }: { item: ItemNav; ativo: boolean }) {
  const Icone = ICONES[item.icone];
  const contagem = item.contagem && item.contagem.valor > 0 ? item.contagem : null;

  return (
    <Link
      href={item.href}
      aria-current={ativo ? "page" : undefined}
      className={cn(
        "flex min-h-9 items-center gap-3 rounded-md px-3 py-1.5 text-sm",
        ativo
          ? "bg-acao-suave font-medium text-acao"
          : "text-texto hover:bg-fundo-hover",
      )}
    >
      <Icone aria-hidden strokeWidth={1.5} className={cn("size-4 shrink-0", !ativo && "text-texto-suave")} />
      <span className="min-w-0 flex-1 truncate">{item.rotulo}</span>
      {contagem ? (
        <>
          <span
            aria-hidden
            className={cn(
              "inline-flex min-w-6 justify-center rounded-sm border bg-fundo px-1.5 text-xs font-medium tabular-nums",
              contagem.alerta ? "border-alerta/40 text-alerta" : "border-borda text-texto",
            )}
          >
            {contagem.valor}
          </span>
          <span className="sr-only">
            , {contagem.valor} {contagem.descricao}
          </span>
        </>
      ) : null}
    </Link>
  );
}
