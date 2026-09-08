import "server-only";

import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * Slug da organização usada para montar o e-mail sintético no login.
 *
 * O Portal é multiempresa desde o dia 1, mas na tela de login ainda não existe
 * sessão — não dá para descobrir a organização pelo banco. Enquanto o produto
 * roda em um domínio por prestadora, a instalação declara o seu slug aqui.
 * Quando entrar a segunda organização (F6.3), este helper passa a resolver o
 * slug pelo host da requisição; o resto do código não muda.
 */
export function slugOrganizacao(): string {
  return process.env.ORG_SLUG ?? "3e";
}

/**
 * Guarda de boot: confere que `ORG_SLUG` existe em `organizacoes.slug`.
 *
 * Por que isto merece derrubar o servidor: com o slug errado, o e-mail
 * sintético `<cpf>@func.<slug>.portal3e` nunca casa com nenhuma linha de
 * `auth.users`. O Supabase responde "Invalid login credentials" e **todo
 * funcionário** fica de fora — com a aparência exata de senha errada, sem uma
 * linha no log apontando para a causa. Falhar no boot troca esse silêncio por
 * uma mensagem única, na hora do deploy.
 *
 * Usa `service_role` porque `organizacoes` só tem policy de select para
 * `authenticated`, e no boot não há sessão nenhuma.
 */
export async function verificarSlugOrganizacao(): Promise<void> {
  const slug = slugOrganizacao();
  const admin = criarClienteAdmin();

  const { data, error } = await admin
    .from("organizacoes")
    .select("id, nome")
    .eq("slug", slug)
    .maybeSingle();

  // Banco fora do ar não é erro de configuração. Derrubar o processo por uma
  // falha de rede transformaria uma instabilidade em indisponibilidade.
  if (error) {
    console.error(
      `[boot] não foi possível verificar ORG_SLUG="${slug}": ${error.message}. ` +
        "A aplicação vai subir, mas confira o Supabase.",
    );
    return;
  }

  if (!data) {
    const { data: existentes } = await admin
      .from("organizacoes")
      .select("slug")
      .order("slug");

    const lista =
      existentes?.map((o) => o.slug).join(", ") || "(nenhuma organização cadastrada)";

    throw new Error(
      `ORG_SLUG="${slug}" não corresponde a nenhuma organizacoes.slug. ` +
        `Com esse valor, o e-mail sintético <cpf>@func.${slug}.portal3e não casa com ` +
        "auth.users e TODO login por CPF falha como se fosse senha errada. " +
        `Slugs cadastrados: ${lista}. Corrija ORG_SLUG no ambiente antes de subir.`,
    );
  }

  console.log(`[boot] ORG_SLUG="${slug}" → ${data.nome}`);
}
