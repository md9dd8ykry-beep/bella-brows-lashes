/**
 * UTILITÁRIOS DE INTERFACE — formatação, links e diálogos.
 */
(function (root) {
  "use strict";
  var B = root.Bella;
  var S = B.scheduler;

  var MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  var WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

  var ui = {
    MONTHS: MONTHS,
    WEEKDAYS: WEEKDAYS,

    /** Escapa texto antes de colocá-lo em HTML. */
    esc: function (v) {
      return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    },

    money: function (v) {
      return "R$ " + Number(v).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    },

    /** 100 → "1h40", 60 → "1h", 40 → "40 min" */
    duration: function (min) {
      var h = Math.floor(min / 60), m = min % 60;
      if (!h) return m + " min";
      return h + "h" + (m ? S.pad(m) : "");
    },

    /** "2026-11-27" → "sexta-feira, 27 de novembro" */
    longDate: function (key) {
      var d = S.parseKey(key);
      return WEEKDAYS[d.getDay()] + ", " + d.getDate() + " de " + MONTHS[d.getMonth()];
    },

    /** Máscara (00) 00000-0000 */
    maskPhone: function (v) {
      var d = String(v).replace(/\D/g, "").slice(0, 11);
      if (d.length <= 2) return d.length ? "(" + d : "";
      if (d.length <= 6) return "(" + d.slice(0, 2) + ") " + d.slice(2);
      if (d.length <= 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
      return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
    },

    waLink: function (message) {
      var c = B.config.contact;
      return "https://wa.me/" + c.whatsapp + (message ? "?text=" + encodeURIComponent(message) : "");
    },

    /** Abre um <dialog> como modal (com alternativa para navegadores antigos). */
    openDialog: function (dlg) {
      if (dlg.open) return;
      if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
      document.documentElement.classList.add("no-scroll");
    },

    closeDialog: function (dlg) {
      if (typeof dlg.close === "function" && dlg.open) dlg.close(); else dlg.removeAttribute("open");
      document.documentElement.classList.remove("no-scroll");
    },

    toast: function (msg) {
      var t = document.getElementById("toast");
      t.textContent = msg;
      t.hidden = false;
      clearTimeout(ui._tt);
      ui._tt = setTimeout(function () { t.hidden = true; }, 2600);
    },

    /** Copia texto; usa alternativa quando a API de área de transferência não está disponível. */
    copy: function (text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).catch(function () { return ui._copyFallback(text); });
      }
      return Promise.resolve(ui._copyFallback(text));
    },
    _copyFallback: function (text) {
      var ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) { /* ignore */ }
      ta.remove();
    }
  };

  B.ui = ui;
})(window);
