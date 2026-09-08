/**
 * Verificações que rodam uma vez, antes de o servidor aceitar requisição.
 *
 * `register()` é o hook de boot do Next (instrumentation.js). O que falhar
 * aqui derruba a subida — que é o ponto: erro de configuração tem de aparecer
 * no deploy, não no primeiro usuário que tenta entrar.
 */
export async function register() {
  // O import é dinâmico e só no runtime Node: a guarda usa service_role e
  // nunca pode ser puxada para o bundle do edge.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { verificarSlugOrganizacao } = await import("@/lib/auth/organizacao");
  await verificarSlugOrganizacao();
}
