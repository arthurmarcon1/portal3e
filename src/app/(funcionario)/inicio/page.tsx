import type { Metadata } from "next";

import { exigirUsuario } from "@/lib/auth/sessao";

export const metadata: Metadata = { title: "Início · Portal 3e" };

export default async function PaginaFuncionario() {
  const usuario = await exigirUsuario();


  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <h1 className="text-xl">Olá, {usuario.nome.split(" ")[0]}</h1>
      <p className="mt-2 text-texto-suave">
        Você ainda não tem nada pendente. Quando a 3e publicar um espelho ou um
        comunicado para você, ele aparece aqui.
      </p>
    </main>
  );
}
