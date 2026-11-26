/**
 * CONFIGURAÇÃO DA PLATAFORMA
 * ------------------------------------------------------------------
 * Cole aqui os dados PÚBLICOS do seu projeto Supabase
 * (Supabase → Project Settings → API / Data API):
 *   - Project URL
 *   - chave "anon" / "publishable"  (NUNCA a service_role / secret)
 *
 * Enquanto estiver vazio, o site funciona em MODO DEMONSTRAÇÃO LOCAL
 * (reservas só no navegador) e o painel mostra como conectar o servidor.
 */
window.Bella = window.Bella || {};
window.Bella.platform = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  // Profissional exibida quando o endereço não tem ?p=
  defaultSlug: "bella"
};
