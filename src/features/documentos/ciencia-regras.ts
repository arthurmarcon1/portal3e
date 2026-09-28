/**
 * Regras da tela de ciência que a tela e a Server Action compartilham.
 *
 * Fora de `ciencia.ts` porque arquivo `"use server"` só exporta função
 * assíncrona.
 */

/** Mínimo da justificativa de divergência (docs/05, F3.4). O banco confere igual (0017). */
export const MINIMO_JUSTIFICATIVA = 20;
