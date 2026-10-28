/**
 * Avatar de iniciais (docs/04, "Avatar"). Módulo puro: a regra que o teste de
 * unidade cobre sem tela.
 *
 * Só iniciais por enquanto — foto de perfil precisa de caminho próprio no
 * Storage, decidido à parte (docs/06, "Foto de perfil").
 */

/** Quantas cores existem. Precisa bater com `--avatar-N-*` em globals.css. */
export const CORES_DE_AVATAR = 8;

/** Partículas que não viram inicial: "Maria da Silva" é MS, não MD. */
const PARTICULAS = new Set(["da", "de", "do", "das", "dos", "e"]);

/**
 * Primeira letra do primeiro nome + primeira do último, sem partícula.
 * Nome de uma palavra só dá uma letra. Acento fica ("Ângela" → "Â").
 */
export function iniciais(nome: string): string {
  const palavras = nome
    .trim()
    .split(/\s+/)
    .filter((p) => p && !PARTICULAS.has(p.toLocaleLowerCase("pt-BR")));
  const letra = (p: string) => p.match(/\p{L}/u)?.[0] ?? "";
  if (palavras.length === 0) return "";
  const primeira = letra(palavras[0]);
  const ultima = palavras.length > 1 ? letra(palavras[palavras.length - 1]) : "";
  return (primeira + ultima).toLocaleUpperCase("pt-BR");
}

/**
 * Índice da cor, estável por pessoa: FNV-1a 32 bits do id.
 *
 * Do id, e não do nome: homônimos ganhariam a mesma cor, e corrigir a grafia
 * trocaria a cor da pessoa. Nem do CPF: CPF não vira insumo de nada no
 * navegador. A cor não significa nada — só ajuda o olho a reencontrar alguém.
 */
export function corDoAvatar(semente: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < semente.length; i++) {
    hash ^= semente.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % CORES_DE_AVATAR;
}
