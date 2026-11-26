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

  // Fotos ilustrativas com licença livre (Unsplash License — uso gratuito, sem atribuição obrigatória).
  // Se alguma não carregar, o site usa automaticamente a ilustração local indicada em `fallback`.
  var U = "https://images.unsplash.com/";
  function photo(id, w) { return U + id + "?auto=format&fit=crop&w=" + (w || 900) + "&q=70"; }
  var PHOTOS = {
    hero: photo("photo-1519415387722-a1c3bbef716c", 900),
    design: photo("photo-1674049406179-d7bf2c263e71"),
    henna: photo("photo-1777521778743-d152c0404e32"),
    lamination: photo("photo-1666858619985-701e36b3bc57"),
    cilios: photo("photo-1772236617396-2f8460293c07"),
    resCilios: photo("photo-1639629509821-c54cdd984227"),
    resCilios2: photo("photo-1683719312734-e31de63957ab"),
    resOlhar: photo("photo-1542833807-ad5af0977050"),
    resEstudio: photo("photo-1589710751893-f9a6770ad71b"),
    resSobrancelha: photo("photo-1674049406467-824ea37c7184")
  };

  var config = {
    /** Identificador da profissional (útil para multi‑profissionais no futuro). */
    professionalId: "demo-bella",

    brand: {
      name: "Bella Brows & Lashes",
      shortName: "Bella",
      tagline: "Olhar realçado com técnica, delicadeza e um cuidado que respeita a sua beleza natural.",
      logo: "assets/img/logo-marca.svg",
      heroImage: PHOTOS.hero,
      heroFallback: "assets/img/hero.svg",
      wordmark: "Bella",
      subtitle: "Brows & Lashes",
      // cores da identidade visual (o painel permite alterar)
      theme: { primary: "#b5786a", primaryDeep: "#9a5f52", soft: "#ecd6cf", accent: "#a8845a", bg: "#f7f0ea", ink: "#4a352c" },
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
        image: PHOTOS.design,
        fallback: "assets/img/servico-design.svg"
      },
      {
        id: "design-henna",
        name: "Design de sobrancelha com henna",
        description: "Design personalizado com aplicação de henna para preencher falhas e definir o formato.",
        durationMin: 60,
        price: 65,
        image: PHOTOS.henna,
        fallback: "assets/img/servico-henna.svg"
      },
      {
        id: "brow-lamination",
        name: "Brow Lamination",
        description: "Alinhamento dos fios para cima, com efeito de sobrancelhas mais volumosas e penteadas.",
        durationMin: 60,
        price: 120,
        image: PHOTOS.lamination,
        fallback: "assets/img/servico-lamination.svg"
      },
      {
        id: "extensao-cilios",
        name: "Extensão de cílios",
        description: "Aplicação fio a fio para alongar e dar curvatura aos cílios, com acabamento natural.",
        durationMin: 120,
        price: 180,
        image: PHOTOS.cilios,
        fallback: "assets/img/servico-cilios.svg"
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

    /** Galeria de resultados — fotos ILUSTRATIVAS (não são trabalhos da profissional) */
    gallery: [
      { title: "Extensão de cílios", after_url: PHOTOS.resCilios, is_illustrative: true },
      { title: "Design de sobrancelha", after_url: PHOTOS.resSobrancelha, is_illustrative: true },
      { title: "Cílios alongados", after_url: PHOTOS.resCilios2, is_illustrative: true },
      { title: "Olhar valorizado", after_url: PHOTOS.resOlhar, is_illustrative: true },
      { title: "Ambiente de atendimento", after_url: PHOTOS.resEstudio, is_illustrative: true }
    ],

    payment: {
      provider: "manual-pix",   // futuro: "mercadopago" | "asaas" | "stripe" … (confirmação via webhook)
      pixKeyDisplay: "chave-pix-demonstrativa"
    },

    policy: {
      text: "Cancelamentos e remarcações com pelo menos 24 horas de antecedência têm o sinal devolvido ou transferido para a nova data. Com menos de 24 horas, o sinal pode ficar retido.",
      deadlineHours: 24
    }
  };

  root.Bella = root.Bella || {};
  root.Bella.config = config;
  root.Bella.PHOTOS = PHOTOS;
})(typeof window !== "undefined" ? window : globalThis);
