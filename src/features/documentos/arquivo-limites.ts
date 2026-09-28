/**
 * Limite de tamanho do PDF, separado de `arquivo.ts` porque a tela também o
 * usa — e `arquivo.ts` importa `node:crypto`, que não vai para o navegador.
 *
 * Um pouco abaixo do `bodySizeLimit` da Server Action (8 MB, next.config.ts).
 */
export const TAMANHO_MAXIMO = 7 * 1024 * 1024;
