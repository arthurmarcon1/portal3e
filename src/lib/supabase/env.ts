/**
 * Leitura das variáveis de ambiente do Supabase.
 *
 * Falha cedo e em português: variável faltando derruba o boot com uma mensagem
 * que diz o que fazer, em vez de um erro de rede opaco no primeiro fetch.
 */

function obrigatoria(nome: string, valor: string | undefined): string {
  if (!valor) {
    throw new Error(
      `Variável de ambiente ${nome} não definida. Copie .env.example para .env.local e preencha.`,
    );
  }
  return valor;
}

export function urlSupabase(): string {
  return obrigatoria(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
}

export function chaveAnon(): string {
  return obrigatoria(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function chaveServiceRole(): string {
  return obrigatoria(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
