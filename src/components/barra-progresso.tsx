import { percentual } from "@/features/inicio/campanhas";

/**
 * Barra de progresso sóbria (docs/04): trilho neutro, preenchimento em cinza,
 * sem gradiente, sem cor de destaque e sem animação — o número ao lado é
 * quem informa, a barra só dá a proporção de relance.
 *
 * `rotulo` é o nome acessível ("Espelho de ponto — 08/2026: responderam").
 */
export function BarraProgresso({ parte, total, rotulo }: { parte: number; total: number; rotulo: string }) {
  const pct = percentual(parte, total);
  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-label={rotulo}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={parte}
        aria-valuetext={`${parte} de ${total} (${pct}%)`}
        className="h-2 flex-1 overflow-hidden rounded-sm border border-borda bg-fundo-alt"
      >
        <div className="h-full bg-texto-suave" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-sm text-texto-suave tabular-nums">{pct}%</span>
    </div>
  );
}
