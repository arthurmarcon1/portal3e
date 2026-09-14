import type { Pessoa } from "@/features/pessoas/queries";
import { formatarCpf } from "@/lib/cpf-cnpj";

/**
 * Dados cadastrais, em lista de definição.
 *
 * Server Component: é leitura pura. O que edita está no cabeçalho da ficha.
 */

/** dd/mm/aaaa a partir do ISO do banco, sem passar por Date (evita fuso). */
function dataBr(iso: string | null): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** (51) 99010-0079 — o banco guarda só dígitos. */
function telefoneBr(digitos: string | null): string {
  if (!digitos) return "—";
  if (digitos.length === 11) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  }
  if (digitos.length === 10) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  }
  return digitos;
}

export function AbaDados({ pessoa }: { pessoa: Pessoa }) {
  const campos: { rotulo: string; valor: string; numerico?: boolean }[] = [
    { rotulo: "Nome completo", valor: pessoa.nome },
    { rotulo: "CPF", valor: formatarCpf(pessoa.cpf), numerico: true },
    { rotulo: "Matrícula", valor: pessoa.matricula ?? "—", numerico: true },
    { rotulo: "Data de nascimento", valor: dataBr(pessoa.data_nascimento), numerico: true },
    { rotulo: "Telefone", valor: telefoneBr(pessoa.telefone), numerico: true },
    { rotulo: "E-mail pessoal", valor: pessoa.email_pessoal ?? "—" },
    { rotulo: "Endereço", valor: pessoa.endereco ?? "—" },
  ];

  return (
    <dl className="grid gap-px overflow-hidden rounded-lg border border-borda bg-borda sm:grid-cols-2">
      {campos.map((campo) => (
        <div key={campo.rotulo} className="bg-fundo px-4 py-3">
          <dt className="text-xs text-texto-suave">{campo.rotulo}</dt>
          <dd className={campo.numerico ? "tabular-nums" : undefined}>{campo.valor}</dd>
        </div>
      ))}
    </dl>
  );
}
