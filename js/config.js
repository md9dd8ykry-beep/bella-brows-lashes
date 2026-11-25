/**
 * CONFIGURAÇÃO DO NEGÓCIO — Bella Brows & Lashes (DEMONSTRAÇÃO)
 * ------------------------------------------------------------------
 * Tudo o que a profissional poderá editar no futuro painel administrativo
 * está concentrado aqui: marca, contatos, endereço, procedimentos,
 * preços, durações e regras da agenda.
 *
 * Futuro: este objeto passará a ser carregado de uma API
 * (ex.: GET /api/profissionais/:slug/config). O restante do código
 * só lê `Bella.config`, então a troca não exige mudanças na interface.
 */
(function (root) {
  "use strict";

  var config = {
    /** Identificador da profissional (útil para multi‑profissionais no futuro). */
    professionalId: "demo-bella",

    brand: {
      name: "Bella Brows & Lashes",
      shortName: "Bella",
      tagline: "Olhar realçado com técnica, delicadeza e um cuidado que respeita a sua beleza natural.",
      logo: "assets/img/logo-marca.svg",
      heroImage: "assets/img/hero.svg",
      year: new Date().getFullYear()
    },

    contact: {
      // Número DEMONSTRATIVO (formato internacional, só dígitos). Substitua pelo real.
      whatsapp: "5500000000000",
      whatsappDisplay: "(00) 00000-0000",
      whatsappMessage: "Olá! Vim pelo site da Bella Brows & Lashes e gostaria de tirar uma dúvida.",
      // Perfil DEMONSTRATIVO: o link aponta para a página inicial do Instagram
      // para não direcionar a um perfil real de terceiros. Troque por https://www.instagram.com/seuperfil
      instagramUrl: "https://www.instagram.com/",
      instagramHandle: "@seuperfil"
    },

    location: {
      isDemo: true,
      // Endereço FICTÍCIO de demonstração
      line1: "Avenida Exemplo, 1000 — Sala 00",
      line2: "Bairro Demonstração · Cidade/UF · CEP 00000-000",
      hours: "Segunda a sábado · 07h às 11h30 e 13h30 às 17h30",
      // Quando houver endereço real, troque por um link do Google Maps do estúdio
      mapsUrl: "https://www.google.com/maps",
      // Opcional: URL de incorporação (Google Maps → Compartilhar → Incorporar um mapa).
      // Vazio = usa o mapa ilustrativo.
      mapsEmbedUrl: ""
    },

    /** Procedimentos: preço em reais, duração em minutos. */
    services: [
      {
        id: "design-simples",
        name: "Design simples de sobrancelha",
        description: "Mapeamento do rosto e remoção dos fios com pinça para um desenho limpo e harmônico.",
        durationMin: 40,
        price: 45,
        image: "assets/img/servico-design.svg"
      },
      {
        id: "design-henna",
        name: "Design de sobrancelha com henna",
        description: "Design personalizado com aplicação de henna para preencher falhas e definir o formato.",
        durationMin: 60,
        price: 65,
        image: "assets/img/servico-henna.svg"
      },
      {
        id: "brow-lamination",
        name: "Brow Lamination",
        description: "Alinhamento dos fios para cima, com efeito de sobrancelhas mais volumosas e penteadas.",
        durationMin: 60,
        price: 120,
        image: "assets/img/servico-lamination.svg"
      },
      {
        id: "extensao-cilios",
        name: "Extensão de cílios",
        description: "Aplicação fio a fio para alongar e dar curvatura aos cílios, com acabamento natural.",
        durationMin: 120,
        price: 180,
        image: "assets/img/servico-cilios.svg"
      }
    ],

    /** Regras da agenda */
    agenda: {
      timezoneNote: "Horários no fuso local do aparelho.",
      // 0 = domingo … 6 = sábado
      workDays: [1, 2, 3, 4, 5, 6],
      periods: [
        { label: "Manhã", start: "07:00", end: "11:30" },
        { label: "Tarde", start: "13:30", end: "17:30" }
      ],
      slotStepMin: 15,          // de quanto em quanto tempo os horários são oferecidos
      bufferMin: 10,            // intervalo de preparo entre um atendimento e outro
      minNoticeMin: 60,         // antecedência mínima para agendar no mesmo dia
      bookingWindowDays: 60,    // até quantos dias à frente a agenda abre
      depositPercent: 50,       // sinal demonstrativo
      // Datas fechadas (AAAA-MM-DD). A demonstração acrescenta algumas datas relativas a hoje.
      blockedDates: [
        { date: "2026-12-25", reason: "Natal" },
        { date: "2027-01-01", reason: "Ano-novo" }
      ],
      // Faixas bloqueadas em dias específicos (ex.: compromisso pessoal)
      blockedRanges: []
    },

    payment: {
      provider: "demo",         // futuro: "pix" | "mercadopago" | "stripe" …
      pixKeyDisplay: "chave-pix-demonstrativa"
    }
  };

  root.Bella = root.Bella || {};
  root.Bella.config = config;
})(typeof window !== "undefined" ? window : globalThis);
