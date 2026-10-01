// THROWAWAY reference stub of the approved Theseus HTTP contract, used only to check
// that spec/theseus.test.ts passes when the behaviour exists and fails when a rule is
// broken. In memory, outside the repo; not the app. MUTANT env var breaks one rule:
//   globalversion   one version for the whole sentence
//   textversion     the "version" is the word text itself
//   spendonrefusal  a refused attempt uses up the visitor's change
//   noescape        nothing is escaped
//   escapelabelonly the label is escaped, history and earlier forms are not
import http from "node:http";
const MUTANT = process.env.MUTANT || "";
const START = "Make a website that people would miss if it disappeared".split(" ");
const pos = START.map((w) => ({ word: w, version: 1, past: [] }));
const changes = []; // {i, word, visitor}
const spent = new Map(); // visitor -> index into changes
const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const escLabel = (s) => (MUTANT === "noescape" ? s : escape(s));
const escOther = (s) => (MUTANT === "noescape" || MUTANT === "escapelabelonly" ? s : escape(s));
const stateAt = (n) => { const w = [...START]; for (const c of changes.slice(0, n)) w[c.i] = c.word; return w; };
const versionOf = (p) => (MUTANT === "globalversion" ? changes.length + 1 : MUTANT === "textversion" ? p.word : p.version);
let nextId = 1;
http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let id = (req.headers.cookie || "").match(/v=(\w+)/)?.[1];
  const headers = { "content-type": "text/html; charset=utf-8" };
  if (!id) { id = String(nextId++); headers["set-cookie"] = `v=${id}; Path=/; HttpOnly`; }
  if (req.method === "GET" && url.pathname === "/") {
    if (url.searchParams.has("at")) {
      const n = Math.max(0, Math.min(changes.length, Number(url.searchParams.get("at"))));
      res.writeHead(200, headers);
      return res.end(`<main>\n  <p>\n    ${stateAt(n).map((w) => `<span>${escOther(w)}</span>`).join("\n    ")}\n    .\n  </p>\n</main>`);
    }
    const forms = pos.map((p, i) => `<div><form method="post" action="/replace"><input type="hidden" name="position" value="${i}"><input type="hidden" name="version" value="${escape(String(versionOf(p)))}"><label for="w${i}">${escLabel(p.word)}</label><input id="w${i}" name="word"></form><span aria-hidden="true">${p.past.slice(-4).reverse().map(escOther).join(" ")}</span></div>`).join("");
    // a decoy link first: "the sentence as you left it" also uses ?at=, and must not be mistaken for "prev"
    const mine = spent.has(id) ? `<a href="?at=${spent.get(id) + 1}">As you left it</a>` : "";
    const earlier = changes.length ? `<a rel="prev" href="?at=${changes.length - 1}">Earlier</a>` : "";
    res.writeHead(200, headers); return res.end(`<main>${forms}${mine}${earlier}</main>`);
  }
  if (req.method === "POST" && url.pathname === "/replace") {
    let body = ""; req.on("data", (d) => (body += d)); req.on("end", () => {
      const f = new URLSearchParams(body); const i = Number(f.get("position")); const p = pos[i];
      const word = (f.get("word") || "").trim();
      const done = (code) => { res.writeHead(code, code === 303 ? { ...headers, location: "/" } : headers); res.end(); };
      const refuse = (code) => { if (MUTANT === "spendonrefusal") spent.set(id, -1); done(code); };
      if (spent.has(id)) return done(403);
      if (!p) return refuse(422);
      if (String(versionOf(p)) !== f.get("version")) return refuse(409);
      if (!/^[^\s\p{Cc}]{1,24}$/u.test(word) || word === p.word) return refuse(422);
      p.past.push(p.word); p.word = word; p.version += 1;
      changes.push({ i, word, visitor: id }); spent.set(id, changes.length - 1); done(303);
    }); return;
  }
  res.writeHead(404, headers); res.end();
}).listen(Number(process.env.PORT || 8081), "127.0.0.1");
