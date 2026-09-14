import { z } from "zod";

import { primeiraMensagem, texto, uuid } from "@/lib/campos-zod";
import { ACOES, MODULOS } from "@/lib/auth/modulos";
import { apenasDigitos } from "@/lib/cpf-cnpj";

/**
 * Entrada das telas de administração de acesso (F2.1).
 *
 * O mesmo esquema valida no cliente (zodResolver) e na Server Action. Vale a
 * do servidor.
 */

export { primeiraMensagem };

/**
 * Escopo do usuário: contratos e/ou unidades.
 *
 * Duas listas em vez de uma lista de pares porque é assim que a tela pergunta
 * — "quais contratos?" e "quais unidades?" — e porque `usuario_escopos` aceita
 * linha com só um dos dois (`escopo_nao_vazio`). Lista vazia tem significado
 * oposto conforme o tipo: interno sem escopo alcança tudo da organização;
 * contratante sem escopo não enxerga nada (docs/03, decisão 5).
 */
export const esquemaEscopo = z.object({
  contratos: z.array(uuid).default([]),
  unidades: z.array(uuid).default([]),
});

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Informe o e-mail.")
  .pipe(z.email("E-mail inválido."));

/**
 * Criação de usuário.
 *
 * União discriminada pelo tipo porque os três casos pedem coisas diferentes:
 * funcionário entra pelo CPF de uma pessoa já cadastrada e **não recebe
 * perfil** (docs/02: o acesso dele é fixo, sempre restrito ao próprio
 * `pessoa_id`); interno e contratante entram por e-mail real e precisam de
 * pelo menos um perfil para conseguir fazer qualquer coisa.
 */
export const esquemaUsuarioFuncionario = z.object({
  tipo: z.literal("funcionario"),
  pessoa_id: uuid,
});

export const esquemaUsuarioComEmail = z.object({
  tipo: z.enum(["interno", "contratante"]),
  nome: texto("o nome do usuário"),
  email,
  telefone: z
    .string()
    .trim()
    .transform(apenasDigitos)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
  perfis: z.array(uuid).min(1, "Escolha ao menos um perfil."),
  escopo: esquemaEscopo,
});

export const esquemaNovoUsuario = z.discriminatedUnion("tipo", [
  esquemaUsuarioFuncionario,
  esquemaUsuarioComEmail,
]);

export const esquemaPerfisDoUsuario = z.object({
  usuario_id: uuid,
  perfis: z.array(uuid).default([]),
});

export const esquemaEscoposDoUsuario = z.object({
  usuario_id: uuid,
  escopo: esquemaEscopo,
});

export const esquemaSituacaoDoUsuario = z.object({
  usuario_id: uuid,
  // Sem `arquivado`: usuário é ativo ou não é. Nunca é excluído (F2.1).
  status: z.enum(["ativo", "inativo"]),
});

/**
 * Matriz de um perfil: as duplas `modulo:acao` marcadas na grade.
 *
 * Chega como lista de strings para a tela não ter que montar objeto a cada
 * clique de checkbox; o par é separado na action.
 */
export const esquemaPermissoesDoPerfil = z.object({
  perfil_id: uuid,
  permissoes: z
    .array(
      z
        .string()
        .refine((v) => {
          const [modulo, acao] = v.split(":");
          return (
            (MODULOS as readonly string[]).includes(modulo) &&
            (ACOES as readonly string[]).includes(acao)
          );
        }, "Permissão desconhecida."),
    )
    .default([]),
});

export type EntradaUsuarioComEmail = z.input<typeof esquemaUsuarioComEmail>;
export type EntradaEscopo = z.input<typeof esquemaEscopo>;
