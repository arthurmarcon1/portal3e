/**
 * Cabeçalho do início: saudação pela hora e data por extenso, sempre no fuso
 * de Brasília — o servidor roda em UTC. Puro.
 */

const FUSO = "America/Sao_Paulo";

export function saudacao(agora = new Date()): string {
  const hora = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: FUSO, hour: "numeric", hourCycle: "h23" }).format(agora),
  );
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

/** "Terça-feira, 29 de setembro" — sentence case (docs/04). */
export function dataPorExtenso(agora = new Date()): string {
  const texto = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(agora);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** "1 solicitação vencida" / "3 solicitações vencidas" — o rótulo acompanha o número. */
export function plural(n: number, [um, varios]: readonly [string, string]): string {
  return n === 1 ? um : varios;
}
