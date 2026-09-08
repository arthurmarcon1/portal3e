import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  areaDoCaminho,
  ehRotaPublica,
  ROTA_PRIMEIRO_ACESSO,
  rotaInicial,
} from "@/lib/auth/rotas";
import { chaveAnon, urlSupabase } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Proxy — o antigo `middleware.ts`. O Next 16 renomeou o arquivo e o export;
 * o comportamento é o mesmo (ver node_modules/next/dist/docs, proxy.md).
 *
 * Três responsabilidades, nesta ordem:
 * 1. renovar a sessão do Supabase e repassar os cookies novos;
 * 2. barrar quem não tem sessão em qualquer rota que não seja pública;
 * 3. mandar cada tipo de usuário para a própria área.
 *
 * Esta é a primeira barreira, não a única. Cada layout de área confere de novo
 * com `exigirTipo`, e o dado em si é protegido pela RLS. Um bug aqui não pode
 * virar vazamento.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // A resposta precisa existir antes do client: é nela que os cookies
  // renovados são gravados.
  let resposta = NextResponse.next({ request });

  const supabase = createServerClient<Database>(urlSupabase(), chaveAnon(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesParaGravar) {
        for (const { name, value } of cookiesParaGravar) {
          request.cookies.set(name, value);
        }
        resposta = NextResponse.next({ request });
        for (const { name, value, options } of cookiesParaGravar) {
          resposta.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser valida o token no servidor do Supabase. Não trocar por getSession:
  // aquele confia no cookie, este não.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const irPara = (destino: string) => {
    const url = request.nextUrl.clone();
    url.pathname = destino;
    url.search = "";
    return NextResponse.redirect(url);
  };

  if (!user) {
    if (ehRotaPublica(pathname)) return resposta;

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Só guarda o destino se ele for uma tela — evita voltar para uma API.
    if (pathname !== "/" && !pathname.startsWith("/api")) {
      url.searchParams.set("destino", `${pathname}${search}`);
    }
    return NextResponse.redirect(url);
  }

  const { data: cadastro } = await supabase
    .from("usuarios")
    .select("tipo, precisa_trocar_senha, status")
    .eq("id", user.id)
    .maybeSingle();

  // Conta no Auth sem usuário do Portal, ou desativada: derruba a sessão.
  if (!cadastro || cadastro.status !== "ativo") {
    await supabase.auth.signOut();
    return irPara("/login");
  }

  const inicio = rotaInicial(cadastro.tipo);

  // Troca de senha obrigatória tranca tudo, inclusive a área da pessoa.
  if (cadastro.precisa_trocar_senha) {
    return pathname === ROTA_PRIMEIRO_ACESSO ? resposta : irPara(ROTA_PRIMEIRO_ACESSO);
  }

  if (pathname === ROTA_PRIMEIRO_ACESSO) return irPara(inicio);
  if (ehRotaPublica(pathname) || pathname === "/") return irPara(inicio);

  const area = areaDoCaminho(pathname);
  if (area && area !== cadastro.tipo) return irPara(inicio);

  return resposta;
}

export const config = {
  // Fora: estáticos do Next, imagens otimizadas e arquivos com extensão.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)",
  ],
};
