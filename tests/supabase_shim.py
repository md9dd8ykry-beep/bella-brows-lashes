"""
Simulador LOCAL da API do Supabase (só para testes automatizados).
Implementa o mínimo usado pelo projeto: Auth (senha, refresh, recuperação, troca de senha),
RPC do PostgREST (com papel anon/authenticated e JWT) e upload no Storage.
Roda contra o PostgreSQL local preparado por tests/db/00_supabase_local.sql.

Uso: PGHOST=... PGPORT=... PGUSER=postgres PGDATABASE=plat python3 tests/supabase_shim.py 8791
"""
import json, os, re, secrets, subprocess, sys, time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote
import jwt

SECRET = "segredo-somente-para-testes-locais-0123456789"
ANON_KEY = jwt.encode({"role": "anon", "iss": "shim"}, SECRET, algorithm="HS256")
DB = os.environ.get("PGDATABASE", "plat")
STORE = "/tmp/shim_storage"
MAIL = "/tmp/shim_mail.json"
REFRESH = {}
os.makedirs(STORE, exist_ok=True)


def sql(q, role=None, sub=None):
    pre = ""
    if role:
        pre += f"set role {role};"
        claims = json.dumps({"sub": sub, "role": role} if sub else {"role": role})
        pre += f"select set_config('request.jwt.claims', $c${claims}$c$, false);"
    r = subprocess.run(["psql", "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-d", DB, "-c", pre + q], capture_output=True, text=True)
    out = r.stdout.strip().splitlines()
    return r.returncode == 0, (out[-1] if out else ""), r.stderr


def lit(s):
    return "$v$" + s.replace("$v$", "") + "$v$"


def token_for(uid, email):
    now = int(time.time())
    at = jwt.encode({"sub": uid, "email": email, "role": "authenticated", "exp": now + 3600, "iat": now}, SECRET, algorithm="HS256")
    rt = secrets.token_hex(16)
    REFRESH[rt] = (uid, email)
    return {"access_token": at, "token_type": "bearer", "expires_in": 3600, "refresh_token": rt, "user": {"id": uid, "email": email}}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")

    def send(self, code, obj=None, ctype="application/json", raw=None):
        body = raw if raw is not None else (json.dumps(obj).encode() if obj is not None else b"")
        self.send_response(code)
        self.cors()
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    def claims(self):
        if self.headers.get("apikey") != ANON_KEY:
            return None
        auth = self.headers.get("Authorization", "")
        tk = auth.replace("Bearer ", "")
        try:
            return jwt.decode(tk, SECRET, algorithms=["HS256"], options={"verify_aud": False})
        except jwt.ExpiredSignatureError:
            return {"expired": True}
        except Exception:
            return None

    def do_OPTIONS(self):
        self.send(204)

    def do_GET(self):
        u = urlparse(self.path)
        m = re.match(r"^/storage/v1/object/public/([^/]+)/(.+)$", u.path)
        if m:
            p = os.path.join(STORE, m.group(1), unquote(m.group(2)))
            if os.path.exists(p):
                return self.send(200, raw=open(p, "rb").read(), ctype="image/png")
            return self.send(404, {"message": "not found"})
        if u.path == "/auth/v1/user":
            c = self.claims()
            if not c or c.get("expired") or c.get("role") != "authenticated":
                return self.send(401, {"msg": "JWT expired"})
            return self.send(200, {"id": c["sub"], "email": c.get("email")})
        self.send(404, {"message": "not found"})

    def do_PUT(self):
        u = urlparse(self.path)
        if u.path == "/auth/v1/user":
            c = self.claims()
            if not c or c.get("role") != "authenticated":
                return self.send(401, {"msg": "JWT expired"})
            d = json.loads(self.body() or b"{}")
            pw = d.get("password", "")
            if len(pw) < 8:
                return self.send(422, {"msg": "Password should be at least 8 characters"})
            sql(f"update auth.users set encrypted_password = crypt({lit(pw)}, gen_salt('bf')) where id = '{c['sub']}'")
            return self.send(200, {"id": c["sub"], "email": c.get("email")})
        self.send(404, {})

    def do_POST(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if self.headers.get("apikey") != ANON_KEY:
            return self.send(401, {"message": "Invalid API key"})
        if u.path == "/auth/v1/token":
            d = json.loads(self.body() or b"{}")
            gt = q.get("grant_type", [""])[0]
            if gt == "password":
                ok, out, _ = sql(f"select id||'|'||email from auth.users where lower(email)=lower({lit(d.get('email',''))}) and encrypted_password = crypt({lit(d.get('password',''))}, encrypted_password)")
                if not ok or not out:
                    return self.send(400, {"error": "invalid_grant", "error_description": "Invalid login credentials"})
                uid, email = out.split("|")
                return self.send(200, token_for(uid, email))
            if gt == "refresh_token":
                rt = d.get("refresh_token")
                if rt not in REFRESH:
                    return self.send(400, {"error": "invalid_grant", "error_description": "Invalid Refresh Token"})
                uid, email = REFRESH.pop(rt)
                return self.send(200, token_for(uid, email))
        if u.path == "/auth/v1/recover":
            d = json.loads(self.body() or b"{}")
            redirect = q.get("redirect_to", [""])[0]
            ok, out, _ = sql(f"select id||'|'||email from auth.users where lower(email)=lower({lit(d.get('email',''))})")
            if ok and out:
                uid, email = out.split("|")
                t = token_for(uid, email)
                link = f"{redirect}#access_token={t['access_token']}&expires_in=3600&refresh_token={t['refresh_token']}&token_type=bearer&type=recovery"
                json.dump({"email": email, "link": link}, open(MAIL, "w"))
            return self.send(200, {})
        if u.path == "/auth/v1/logout":
            return self.send(204)
        m = re.match(r"^/rest/v1/rpc/([a-z_]+)$", u.path)
        if m:
            c = self.claims()
            if c is None:
                return self.send(401, {"message": "Invalid JWT"})
            if c.get("expired"):
                return self.send(401, {"code": "PGRST301", "message": "JWT expired"})
            role = c.get("role", "anon")
            d = json.loads(self.body() or b"{}")
            ok, out, err = sql(f"select public.{m.group(1)}(p => {lit(json.dumps(d.get('p', {})))}::jsonb)::text", role, c.get("sub"))
            if ok:
                return self.send(200, raw=(out or "null").encode())
            msg = re.search(r"ERROR:\s+(.*)", err)
            hint = re.search(r"HINT:\s+(.*)", err)
            msg = msg.group(1) if msg else err
            if "permission denied" in msg:
                return self.send(401 if role == "anon" else 403, {"code": "42501", "message": msg})
            return self.send(400, {"code": "P0001", "message": msg, "hint": hint.group(1) if hint else None, "details": None})
        m = re.match(r"^/storage/v1/object/([^/]+)/([^/]+)/(.+)$", u.path)
        if m:
            c = self.claims()
            if not c or c.get("role") != "authenticated":
                return self.send(401, {"message": "Unauthorized"})
            ok, out, _ = sql(f"select app.is_member({lit(m.group(2))}::uuid)", "authenticated", c["sub"])
            if not ok or out != "t":
                return self.send(403, {"message": "new row violates row-level security policy"})
            p = os.path.join(STORE, m.group(1), m.group(2), unquote(m.group(3)))
            os.makedirs(os.path.dirname(p), exist_ok=True)
            open(p, "wb").write(self.body())
            return self.send(200, {"Key": f"{m.group(1)}/{m.group(2)}/{m.group(3)}"})
        self.send(404, {"message": "not found"})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8791
    print("ANON_KEY=" + ANON_KEY, flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
