import { corDoAvatar, iniciais } from "@/lib/avatar";
import { cn } from "@/lib/utils";

const TAMANHOS = {
  24: "size-6 text-[10px]",
  32: "size-8 text-xs",
  40: "size-10 text-sm",
  64: "size-16 text-xl",
} as const;

/**
 * Iniciais em círculo (docs/04, "Avatar") — a única exceção nomeada ao teto de
 * 8px de raio.
 *
 * `semente` é o id da pessoa (ou do usuário, se não houver pessoa): a mesma
 * pessoa tem sempre a mesma cor, em qualquer lista. Decorativo: o nome está
 * sempre escrito ao lado, então o avatar sai da leitura de tela.
 */
export function AvatarPessoa({
  nome,
  semente,
  tamanho = 32,
  className,
}: {
  nome: string;
  semente: string;
  tamanho?: keyof typeof TAMANHOS;
  className?: string;
}) {
  const cor = corDoAvatar(semente);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
        TAMANHOS[tamanho],
        className,
      )}
      style={{ backgroundColor: `var(--avatar-${cor}-fundo)`, color: `var(--avatar-${cor}-texto)` }}
    >
      {iniciais(nome)}
    </span>
  );
}
