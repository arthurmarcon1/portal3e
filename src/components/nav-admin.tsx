"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type ItemNav = { href: string; rotulo: string };

/**
 * Navegação da área interna.
 *
 * Os itens chegam prontos do servidor, já filtrados por permissão: link que a
 * pessoa não pode abrir não aparece. Isso é conveniência de UI — quem barra
 * de verdade é o layout do módulo.
 */
export function NavAdmin({ itens }: { itens: ItemNav[] }) {
  const caminho = usePathname();

  return (
    <nav aria-label="Seções da administração" className="border-b border-borda bg-fundo">
      <ul className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-4">
        {itens.map((item) => {
          const ativo =
            caminho === item.href ||
            (item.href !== "/admin" && caminho.startsWith(`${item.href}/`));

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={ativo ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center border-b-2 px-3 text-sm whitespace-nowrap",
                  ativo
                    ? "border-acao font-medium text-acao"
                    : "border-transparent text-texto-suave hover:text-texto",
                )}
              >
                {item.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
