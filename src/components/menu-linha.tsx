"use client";

import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Menu de ações da linha. Fica sempre na última coluna, à direita (docs/04). */
export function MenuLinha({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Ações da linha">
          <MoreHorizontal aria-hidden strokeWidth={1.5} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
