/**
 * Bloqueio temporário de login por tentativas repetidas.
 *
 * A regra lê a própria `auditoria`: `falha_login` já era gravada desde a F0.3,
 * então o que faltava era só perguntar a ela antes de testar a senha. Não há
 * contador em tabela separada — um segundo lugar para a mesma verdade
 * divergiria do log no primeiro insert que falhasse.
 *
 * Janela deslizante: **`LIMITE_FALHAS` falhas dentro de `JANELA_MINUTOS`
 * bloqueiam**, e o bloqueio acaba quando a mais antiga dessas falhas sai da
 * janela. Na prática, quem tenta adivinhar a senha fica limitado a
 * `LIMITE_FALHAS` palpites a cada `JANELA_MINUTOS`, por identificador.
 *
 * Tentativa feita durante o bloqueio NÃO testa a senha e NÃO conta como
 * falha. Contar faria o bloqueio de quem insiste nunca terminar — inclusive o
 * do dono da conta, que é quem mais insiste.
 *
 * Login bem-sucedido e senha redefinida pela recuperação zeram a contagem.
 *
 * Os números vêm do mesmo teto que docs/02 já fixa para o código de uso único
 * (5 tentativas). Estão em aberto em docs/06 — mudar é trocar as constantes.
 *
 * Módulo puro de propósito: é a peça que o teste de unidade cobre sem banco.
 */

export const LIMITE_FALHAS = 5;
export const JANELA_MINUTOS = 15;

/** Ações de `auditoria` que a regra lê. O índice parcial da 0011 cobre estas. */
export const ACOES_DE_TENTATIVA = ["falha_login", "login", "senha_redefinida"] as const;

export type EventoDeTentativa = {
  acao: string;
  criado_em: string;
};

export type SituacaoDeBloqueio =
  | { bloqueado: false; falhasRecentes: number }
  | { bloqueado: true; ate: Date; minutosRestantes: number };

/** Início da janela que interessa à regra, para a consulta não trazer mais que isso. */
export function inicioDaJanela(agora: Date): Date {
  return new Date(agora.getTime() - JANELA_MINUTOS * 60_000);
}

export function avaliarBloqueio(
  eventos: readonly EventoDeTentativa[],
  agora: Date,
): SituacaoDeBloqueio {
  const inicio = inicioDaJanela(agora).getTime();

  const naJanela = eventos
    .map((e) => ({ acao: e.acao, em: new Date(e.criado_em).getTime() }))
    // Sem teto em `agora`: `criado_em` vem do relógio do banco, e um banco
    // adiantado alguns segundos faria a falha recém-gravada ser descartada.
    .filter((e) => Number.isFinite(e.em) && e.em > inicio)
    .sort((a, b) => b.em - a.em);

  // Só contam as falhas depois do último acerto: quem errou quatro vezes e
  // entrou na quinta não começa a próxima sessão devendo tentativas.
  const falhas: number[] = [];
  for (const evento of naJanela) {
    if (evento.acao !== "falha_login") break;
    falhas.push(evento.em);
  }

  if (falhas.length < LIMITE_FALHAS) {
    return { bloqueado: false, falhasRecentes: falhas.length };
  }

  // A `LIMITE_FALHAS`-ésima falha mais recente é a que, ao sair da janela,
  // devolve a contagem para baixo do limite.
  const ate = new Date(falhas[LIMITE_FALHAS - 1] + JANELA_MINUTOS * 60_000);
  const minutosRestantes = Math.max(1, Math.ceil((ate.getTime() - agora.getTime()) / 60_000));

  return { bloqueado: true, ate, minutosRestantes };
}

export function mensagemDeBloqueio(minutosRestantes: number): string {
  const tempo = minutosRestantes === 1 ? "1 minuto" : `${minutosRestantes} minutos`;
  return (
    `Muitas tentativas sem sucesso. Por segurança, o acesso fica bloqueado por ${tempo}. ` +
    "Se esqueceu a senha, use “Esqueci minha senha”."
  );
}
