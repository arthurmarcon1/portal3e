import { z } from "zod";

import { data, opcional, primeiraMensagem, texto, uuid } from "@/lib/campos-zod";

/**
 * Entrada da publicação de documentos (F3.1).
 *
 * O mesmo esquema valida no cliente (zodResolver) e na Server Action. Vale a
 * do servidor — e, depois dela, a RLS e os triggers da migração 0015, que
 * seguram categoria, escopo e ciclo de vida mesmo se esta camada falhar.
 */

export { primeiraMensagem };

/** Máximo de destinatários por documento coletivo. Evita formulário sem fim. */
export const MAX_PUBLICOS = 20;

/**
 * Um público do coletivo: contrato, unidade e/ou função.
 *
 * Os três se combinam por E dentro do público ("porteiros da Unidade Central
 * do 042"); públicos diferentes se somam por OU. Contrato ou unidade é
 * obrigatório — a mesma regra da constraint `destinatario_nao_vazio`: só a
 * função alcançaria a organização inteira, e isso tem de ser escolha
 * explícita de contrato, não efeito de um campo em branco.
 */
export const esquemaPublico = z
  .object({
    contrato_id: uuid.nullable().default(null),
    unidade_id: uuid.nullable().default(null),
    funcao: opcional(120),
  })
  .refine((p) => p.contrato_id !== null || p.unidade_id !== null, {
    message: "Cada público precisa de um contrato ou de uma unidade.",
  });

export type Publico = z.infer<typeof esquemaPublico>;

const camposComuns = {
  tipo_id: uuid,
  titulo: texto("o título", 200),
  descricao: opcional(1000),
};

/**
 * Rascunho novo. O arquivo viaja à parte, no `FormData`: Zod valida os
 * campos, e `validarPdf` o conteúdo.
 */
export const esquemaRascunho = z.discriminatedUnion("escopo", [
  z.object({
    ...camposComuns,
    escopo: z.literal("individual"),
    pessoa_id: uuid,
  }),
  z.object({
    ...camposComuns,
    escopo: z.literal("coletivo"),
    publicos: z
      .array(esquemaPublico)
      .min(1, "Escolha ao menos um público para o documento coletivo.")
      .max(MAX_PUBLICOS, `No máximo ${MAX_PUBLICOS} públicos por documento.`),
  }),
]);

export type EntradaRascunho = z.infer<typeof esquemaRascunho>;

/**
 * Retificação de um publicado: arquivo novo, e título e descrição podem ser
 * corrigidos junto. Tipo, escopo, pessoa e público são os do original — o
 * trigger da 0015 recusa qualquer diferença.
 */
export const esquemaRetificacao = z.object({
  documento_id: uuid,
  titulo: texto("o título", 200),
  descricao: opcional(1000),
});

export type EntradaRetificacao = z.infer<typeof esquemaRetificacao>;

/**
 * Publicar: o prazo vem preenchido com o padrão do tipo e pode ser editado.
 * `valido_ate` só vale para tipo que vence (ASO, treinamento — F5.2); quem
 * exige é o trigger da 0024, que conhece o tipo.
 */
export const esquemaPublicacao = z.object({
  documento_id: uuid,
  prazo_ciencia: data,
  valido_ate: data,
});

export const esquemaId = z.object({ documento_id: uuid });

/**
 * Forma plana do formulário de rascunho, para o react-hook-form.
 *
 * O formulário guarda os dois ramos ao mesmo tempo (quem troca de individual
 * para coletivo e volta não perde a pessoa escolhida), com `""` nos selects
 * vazios. A transformação escolhe o ramo e desemboca em `esquemaRascunho` —
 * as regras continuam num lugar só, e é esse mesmo esquema que a Server
 * Action aplica.
 */
export const esquemaFormularioRascunho = z
  .object({
    tipo_id: z.string(),
    titulo: z.string(),
    descricao: z.string(),
    escopo: z.enum(["individual", "coletivo"]),
    pessoa_id: z.string(),
    publicos: z.array(
      z.object({ contrato_id: z.string(), unidade_id: z.string(), funcao: z.string() }),
    ),
  })
  .transform((v, ctx): EntradaRascunho => {
    const comuns = { tipo_id: v.tipo_id, titulo: v.titulo, descricao: v.descricao };
    const ramo =
      v.escopo === "individual"
        ? { ...comuns, escopo: v.escopo, pessoa_id: v.pessoa_id }
        : {
            ...comuns,
            escopo: v.escopo,
            publicos: v.publicos.map((p) => ({
              contrato_id: p.contrato_id || null,
              unidade_id: p.unidade_id || null,
              funcao: p.funcao,
            })),
          };

    const r = esquemaRascunho.safeParse(ramo);
    if (r.success) return r.data;
    // Mesmos caminhos (`titulo`, `publicos.0`): o erro cai no campo certo.
    for (const issue of r.error.issues) {
      ctx.addIssue({ code: "custom", message: issue.message, path: issue.path });
    }
    return z.NEVER;
  });

export type FormularioRascunho = z.input<typeof esquemaFormularioRascunho>;
