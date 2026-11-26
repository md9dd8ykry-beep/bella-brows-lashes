/**
 * CLIENTE DA API (Supabase) — sem dependências externas
 * ------------------------------------------------------------------
 * Usa apenas os endpoints REST oficiais do Supabase:
 *   Auth:    /auth/v1/token, /auth/v1/recover, /auth/v1/user, /auth/v1/logout
 *   Banco:   /rest/v1/rpc/<função>   (todas as regras ficam no banco, com RLS)
 *   Imagens: /storage/v1/object/<bucket>/<caminho>
 *
 * Só a chave PÚBLICA (anon/publishable) fica no navegador. Ela não dá acesso
 * a nada além do que as políticas de segurança do banco permitem.
 */
(function (root) {
  "use strict";
  var B = (root.Bella = root.Bella || {});

  function ApiError(message, code, status) {
    var e = new Error(message || "Erro de comunicação com o servidor.");
    e.code = code || "ERROR";
    e.status = status || 0;
    return e;
  }

  function createClient(url, key) {
    url = String(url || "").replace(/\/+$/, "");
    var storeKey = "plat.session." + url.replace(/^https?:\/\//, "").split(".")[0];
    var listeners = [];

    function readSession() {
      try { return JSON.parse(root.localStorage.getItem(storeKey) || "null"); } catch (e) { return null; }
    }
    function writeSession(s) {
      try {
        if (s) root.localStorage.setItem(storeKey, JSON.stringify(s)); else root.localStorage.removeItem(storeKey);
      } catch (e) { /* navegação privada: sessão só em memória */ }
      memSession = s;
      listeners.forEach(function (fn) { try { fn(s); } catch (e) { /* ignore */ } });
    }
    var memSession = readSession();

    function toSession(data) {
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
        user: data.user ? { id: data.user.id, email: data.user.email } : null
      };
    }

    function request(path, opts) {
      opts = opts || {};
      var headers = Object.assign({ apikey: key, "Content-Type": "application/json" }, opts.headers || {});
      return fetch(url + path, { method: opts.method || "GET", headers: headers, body: opts.body })
        .catch(function () { throw ApiError("Sem conexão com o servidor. Verifique a internet e tente novamente.", "NETWORK"); })
        .then(function (res) {
          return res.text().then(function (txt) {
            var data = null;
            try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
            if (!res.ok) {
              var msg = data && (data.message || data.msg || data.error_description || data.error);
              var code = data && (data.hint || data.error_code || data.code);
              throw ApiError(translate(msg, code, res.status), code, res.status);
            }
            return data;
          });
        });
    }

    function translate(msg, code, status) {
      var m = String(msg || "");
      if (/invalid login credentials|invalid_grant/i.test(m + code)) return "E-mail/telefone ou senha incorretos.";
      if (/email not confirmed/i.test(m)) return "E-mail ainda não confirmado.";
      if (/rate limit|too many/i.test(m) || status === 429) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
      if (/JWT expired|jwt/i.test(m) && status === 401) return "Sessão expirada. Entre novamente.";
      if (/password should be at least/i.test(m)) return "A senha precisa ter pelo menos 8 caracteres.";
      if (/same_password|should be different/i.test(m + code)) return "A nova senha precisa ser diferente da atual.";
      return m || "Não foi possível concluir. Tente novamente.";
    }

    var refreshing = null;
    function validToken() {
      var s = memSession;
      if (!s) return Promise.resolve(null);
      if (s.expires_at - 60 > Date.now() / 1000) return Promise.resolve(s.access_token);
      if (!refreshing) {
        refreshing = request("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: s.refresh_token }) })
          .then(function (d) { var ns = toSession(d); writeSession(ns); return ns.access_token; })
          .catch(function (e) { writeSession(null); throw ApiError("Sessão expirada. Entre novamente.", "AUTH", 401); })
          .finally(function () { refreshing = null; });
      }
      return refreshing;
    }

    var auth = {
      session: function () { return memSession; },
      onChange: function (fn) { listeners.push(fn); },
      signIn: function (email, password) {
        return request("/auth/v1/token?grant_type=password", { method: "POST", body: JSON.stringify({ email: email, password: password }) })
          .then(function (d) { var s = toSession(d); writeSession(s); return s; });
      },
      signOut: function () {
        var s = memSession;
        writeSession(null);
        if (!s) return Promise.resolve();
        return request("/auth/v1/logout", { method: "POST", headers: { Authorization: "Bearer " + s.access_token } }).catch(function () {});
      },
      /** Envia o e-mail de recuperação; o link volta para redirectTo com #access_token=…&type=recovery */
      recover: function (email, redirectTo) {
        return request("/auth/v1/recover?redirect_to=" + encodeURIComponent(redirectTo), { method: "POST", body: JSON.stringify({ email: email }) });
      },
      /** Lê os tokens que o Supabase coloca no endereço depois do link de recuperação */
      consumeRedirect: function () {
        var h = root.location.hash.replace(/^#/, "");
        if (!/access_token=/.test(h)) return null;
        var q = {};
        h.split("&").forEach(function (kv) { var p = kv.split("="); q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ""); });
        writeSession(toSession({ access_token: q.access_token, refresh_token: q.refresh_token, expires_in: Number(q.expires_in) || 3600 }));
        try { root.history.replaceState(null, "", root.location.pathname + root.location.search); } catch (e) { root.location.hash = ""; }
        return q.type || "magiclink";
      },
      updatePassword: function (password) {
        return validToken().then(function (tk) {
          return request("/auth/v1/user", { method: "PUT", headers: { Authorization: "Bearer " + tk }, body: JSON.stringify({ password: password }) });
        });
      }
    };

    /** Chama uma função do banco. Todas recebem um único objeto `p`. */
    function rpc(fn, params) {
      return validToken().catch(function () { return null; }).then(function (tk) {
        return request("/rest/v1/rpc/" + fn, {
          method: "POST",
          headers: { Authorization: "Bearer " + (tk || key) },
          body: JSON.stringify({ p: params || {} })
        });
      });
    }

    /** Envia uma imagem para tenant-assets/<tenantId>/… e devolve a URL pública */
    function upload(tenantId, file) {
      var ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      var path = tenantId + "/" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7) + "." + ext;
      return validToken().then(function (tk) {
        if (!tk) throw ApiError("Sessão expirada. Entre novamente.", "AUTH", 401);
        return fetch(url + "/storage/v1/object/tenant-assets/" + path, {
          method: "POST",
          headers: { apikey: key, Authorization: "Bearer " + tk, "Content-Type": file.type || "application/octet-stream", "x-upsert": "true" },
          body: file
        });
      }).then(function (res) {
        if (!res.ok) return res.text().then(function (t) { throw ApiError("Não foi possível enviar a imagem (" + res.status + ").", "UPLOAD", res.status); });
        return url + "/storage/v1/object/public/tenant-assets/" + path;
      });
    }

    return { url: url, auth: auth, rpc: rpc, upload: upload };
  }

  B.createClient = createClient;
  B.ApiError = ApiError;

  /** Cliente padrão, se a plataforma estiver configurada (js/platform.config.js) */
  var pc = B.platform || {};
  B.api = pc.supabaseUrl && pc.supabaseAnonKey ? createClient(pc.supabaseUrl, pc.supabaseAnonKey) : null;
})(typeof window !== "undefined" ? window : globalThis);
