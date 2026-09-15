"use client";

import { Clock } from "lucide-react";
import { useEffect, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Aviso de bloqueio por tentativas, com o tempo que falta.
 *
 * Decisão de 2026-09-15 (docs/06): sem desbloqueio manual, e por isso a tela
 * precisa dizer quando libera — senão a pessoa acha que a conta morreu e liga
 * para o RH. O horário vem do servidor (`bloqueadoAte`); a contagem é só
 * apresentação, e quem decide se a próxima tentativa passa continua sendo a
 * `auditoria` lida na action.
 *
 * Leitor de tela: o texto anunciado muda de minuto em minuto, não a cada
 * segundo — um `aria-live` que fala a cada segundo torna a página inutilizável.
 */
export function AvisoBloqueio({ ate }: { ate: string }) {
  const fim = new Date(ate).getTime();
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    const intervalo = setInterval(() => setAgora(Date.now()), 1_000);
    return () => clearInterval(intervalo);
  }, []);

  const restanteMs = Math.max(0, fim - agora);
  const liberado = restanteMs === 0;

  const horario = new Date(fim).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
  const minutos = Math.floor(restanteMs / 60_000);
  const segundos = Math.floor((restanteMs % 60_000) / 1_000);
  const relogio = `${minutos}:${String(segundos).padStart(2, "0")}`;
  const minutosFalados = Math.max(1, Math.ceil(restanteMs / 60_000));

  if (liberado) {
    return (
      <Alert role="status">
        <Clock aria-hidden strokeWidth={1.5} />
        <AlertDescription>Pronto, você já pode tentar entrar de novo.</AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive" className="border-erro/30">
      <Clock aria-hidden strokeWidth={1.5} />
      <AlertDescription>
        <p>
          Muitas tentativas sem sucesso. Por segurança, este acesso está bloqueado até{" "}
          <strong className="font-medium">{horario}</strong>.
        </p>
        <p className="mt-1">
          Faltam{" "}
          <span aria-hidden className="font-medium tabular-nums">
            {relogio}
          </span>
          <span className="sr-only" aria-live="polite">
            {minutosFalados === 1 ? "menos de 1 minuto" : `${minutosFalados} minutos`}
          </span>
          . A conta não foi desativada: depois disso é só entrar de novo.
        </p>
        <p className="mt-1">Se esqueceu a senha, use “Esqueci minha senha”.</p>
      </AlertDescription>
    </Alert>
  );
}
