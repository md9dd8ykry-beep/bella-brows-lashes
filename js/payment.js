/**
 * PAGAMENTO DO SINAL — provedor de DEMONSTRAÇÃO
 * ------------------------------------------------------------------
 * Nenhum valor é cobrado. A interface (assíncrona, com Promises) já é a
 * mesma que um provedor real terá, para a futura integração com Pix
 * (ex.: API do banco / Mercado Pago / Asaas) ou gateway de cartão:
 *
 *   createCharge({ amount, reference, description }) → { id, method, pixCopyPaste, status }
 *   confirm(chargeId)                                 → { id, status }
 *
 * Em produção: o servidor cria a cobrança, e a confirmação chega por
 * webhook do provedor; só então o agendamento passa a "confirmado".
 */
(function (root) {
  "use strict";
  var B = root.Bella;

  var DemoPaymentProvider = {
    name: "demo",
    createCharge: function (opts) {
      var id = "pay_demo_" + Date.now().toString(36);
      return Promise.resolve({
        id: id,
        method: "pix",
        amount: opts.amount,
        status: "pending",
        // Texto meramente ilustrativo — NÃO é um código Pix válido
        pixCopyPaste: "DEMONSTRACAO-SEM-COBRANCA-" + (opts.reference || id).toUpperCase()
      });
    },
    confirm: function (chargeId) {
      return new Promise(function (resolve) {
        setTimeout(function () { resolve({ id: chargeId, status: "simulated" }); }, 900);
      });
    }
  };

  var providers = { demo: DemoPaymentProvider };
  B.payment = providers[(B.config.payment && B.config.payment.provider) || "demo"] || DemoPaymentProvider;
})(typeof window !== "undefined" ? window : globalThis);
