// Genera los SVG del perfil (tema Aurora Blueprint) en assets/.
// Uso: GITHUB_TOKEN=... node scripts/build.mjs        (datos reales)
//      node scripts/build.mjs --fixture                (datos de ejemplo, sin red)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "assets");
const LOGIN = process.env.PROFILE_LOGIN || "edixon-javier";
const FIXTURE = process.argv.includes("--fixture");
const SNAKE = process.env.SNAKE_SVG || join(ROOT, "dist", "snake.svg");
mkdirSync(OUT, { recursive: true });

/* ---------- Tema ---------- */
const T = {
  bg: "#0a1626", a: "#1d4f91", b: "#2a7fd4", c: "#0e5a7a",
  ink: "#7cc4ff", hi: "#e9f4ff", sub: "#bcd6f0", mut: "#6f8fb3", hot: "#ffb547",
  glass: "rgba(124,196,255,.07)", line: "rgba(124,196,255,.22)", grid: "rgba(124,196,255,.10)",
};
const W = 840;
const ICONS = JSON.parse(readFileSync(join(ROOT, "scripts", "icons.json"), "utf8"));

/* ---------- Fuentes incrustadas ---------- */
const FONT_FILES = {
  "sora-300": ["Sora", 300], "sora-400": ["Sora", 400], "sora-700": ["Sora", 700], "sora-800": ["Sora", 800],
  "mono-400": ["JBM", 400], "mono-700": ["JBM", 700],
};
const fontCache = {};
function fonts(...keys) {
  return keys.map((k) => {
    fontCache[k] ??= readFileSync(join(ROOT, "assets", "fonts", `${k}.woff2`)).toString("base64");
    const [fam, w] = FONT_FILES[k];
    return `@font-face{font-family:'${fam}';font-weight:${w};src:url(data:font/woff2;base64,${fontCache[k]}) format('woff2')}`;
  }).join("");
}
const SORA = `'Sora',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif`;
const MONO = `'JBM',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`;

/* ---------- Utilidades ---------- */
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (n) => n.toLocaleString("es-CO");
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
const fecha = (iso, year = true) => { const d = new Date(iso + "T12:00:00Z"); return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}${year ? " " + d.getUTCFullYear() : ""}`; };
const monoW = (text, size) => text.length * size * 0.6; // JetBrains Mono: 0.6em por carácter

function svg(h, body, { fontKeys = [], css = "", title = "" } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<style>${fonts(...fontKeys)}
.sora{font-family:${SORA}}.mono{font-family:${MONO}}
.lbl{font-family:${MONO};font-size:11px;letter-spacing:2.2px;fill:${T.mut}}
${css}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
${body}
</svg>`;
}
const panel = (h) => `<rect width="${W}" height="${h}" rx="16" fill="${T.bg}"/>`;
const labels = (left, right, rightHot = false) =>
  `<text class="lbl" x="28" y="36">${esc(left)}</text>` +
  (right ? `<text class="lbl" x="${W - 28}" y="36" text-anchor="end"${rightHot ? ` style="fill:${T.hot}"` : ""}>${esc(right)}</text>` : "");
const pill = (x, y, text, color) => {
  const w = monoW(text, 12) + 40;
  return { w, svg: `<g transform="translate(${x} ${y})"><rect width="${w}" height="30" rx="15" fill="${T.glass}" stroke="${T.line}"/>
<circle cx="16" cy="15" r="3.5" fill="${color}" class="glow"/><text x="28" y="19.5" class="mono" font-size="12" fill="${T.hi}">${esc(text)}</text></g>` };
};

/* ---------- Datos ---------- */
async function gql(query, variables) {
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, "Content-Type": "application/json", "User-Agent": "profile-builder" },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

async function loadData() {
  if (FIXTURE) return fixture();
  const base = await gql(`query($l:String!){user(login:$l){createdAt
    repositories(privacy:PUBLIC,ownerAffiliations:OWNER){totalCount}
    contributionsCollection{contributionYears totalCommitContributions
      contributionCalendar{totalContributions weeks{contributionDays{date contributionCount}}}}}}`, { l: LOGIN });
  const u = base.user, cc = u.contributionsCollection;
  const years = cc.contributionYears;
  const q = years.map((y) => `y${y}:contributionsCollection(from:"${y}-01-01T00:00:00Z",to:"${y}-12-31T23:59:59Z"){contributionCalendar{weeks{contributionDays{date contributionCount}}}}`).join(" ");
  const all = await gql(`query($l:String!){user(login:$l){${q}}}`, { l: LOGIN });
  const days = new Map();
  for (const y of years) for (const w of all.user[`y${y}`].contributionCalendar.weeks) for (const d of w.contributionDays) days.set(d.date, d.contributionCount);
  const lastYear = cc.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
  return {
    createdAt: u.createdAt, repos: u.repositories.totalCount,
    yearTotal: cc.contributionCalendar.totalContributions, commits: cc.totalCommitContributions,
    allDays: [...days.entries()].sort(([a], [b]) => (a < b ? -1 : 1)), lastYear,
  };
}

function fixture() {
  let s = 7; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const days = []; const start = new Date("2019-09-06T12:00:00Z"), end = new Date("2026-11-13T12:00:00Z");
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const recent = d > new Date("2025-11-10");
    days.push([d.toISOString().slice(0, 10), rnd() < (recent ? 0.6 : 0.12) ? Math.ceil(rnd() * 9) : 0]);
  }
  const lastYear = days.slice(-371).map(([date, contributionCount]) => ({ date, contributionCount }));
  return { createdAt: "2019-09-06T20:25:02Z", repos: 21, yearTotal: 1474, commits: 355, allDays: days, lastYear };
}

function streaks(allDays) {
  const today = new Date().toISOString().slice(0, 10);
  const total = allDays.reduce((a, [, c]) => a + c, 0);
  const first = allDays.find(([, c]) => c > 0)?.[0] ?? allDays[0]?.[0];
  let longest = { len: 0, start: null, end: null }, run = 0, runStart = null;
  for (const [d, c] of allDays) {
    if (d > today) break;
    if (c > 0) { if (!run) runStart = d; run++; if (run > longest.len) longest = { len: run, start: runStart, end: d }; } else run = 0;
  }
  // racha actual: si hoy aún no hay contribuciones, cuenta desde ayer
  const past = allDays.filter(([d]) => d <= today);
  let i = past.length - 1; if (i >= 0 && past[i][1] === 0 && past[i][0] === today) i--;
  let cur = 0, curStart = null, curEnd = past[i]?.[0];
  while (i >= 0 && past[i][1] > 0) { cur++; curStart = past[i][0]; i--; }
  return { total, first, longest, current: { len: cur, start: curStart, end: curEnd } };
}

/* ---------- Bloques ---------- */
function hero() {
  const h = 280;
  const p1 = pill(40, 206, "Construyendo CISOiq e iQData", T.hot);
  const p2 = pill(40 + p1.w + 10, 206, "Pamplona, CO", T.ink);
  return svg(h, `
<defs>
  <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="48"/></filter>
  <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="${T.grid}"/></pattern>
  <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset=".25" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <mask id="m"><rect width="${W}" height="${h}" fill="url(#fade)"/></mask>
  <clipPath id="clip"><rect width="${W}" height="${h}" rx="16"/></clipPath>
</defs>
<g clip-path="url(#clip)">
  ${panel(h)}
  <g filter="url(#blur)" opacity=".75">
    <ellipse class="b b1" cx="110" cy="40" rx="190" ry="120" fill="${T.a}"/>
    <ellipse class="b b2" cx="700" cy="110" rx="170" ry="120" fill="${T.b}"/>
    <ellipse class="b b3" cx="430" cy="300" rx="150" ry="90" fill="${T.c}" opacity=".7"/>
  </g>
  <rect width="${W}" height="${h}" fill="url(#grid)" mask="url(#m)"/>
</g>
<text x="40" y="62" class="mono" font-size="12" letter-spacing="2.6" fill="${T.ink}">SOFTWARE ARCHITECT · GC GROUP</text>
<text x="40" y="124" class="sora" font-size="58" font-weight="800" letter-spacing="-1.8" fill="${T.hi}">Edixon Pabón</text>
<text class="sora" font-size="17" font-weight="300" fill="${T.sub}"><tspan x="40" y="160">Diseño y construyo productos SaaS de punta a punta:</tspan><tspan x="40" y="184">arquitectura, automatización e IA aplicada.</tspan></text>
${p1.svg}${p2.svg}`, {
    fontKeys: ["sora-800", "sora-300", "mono-400"], title: "Edixon Pabón · Software Architect",
    css: `.b{transform-box:fill-box;transform-origin:center;animation:drift 14s ease-in-out infinite alternate}
.b2{animation-delay:-5s}.b3{animation-delay:-9s}
@keyframes drift{to{transform:translate(40px,18px) scale(1.12)}}
.glow{filter:drop-shadow(0 0 4px currentColor)}`,
  });
}

function about() {
  const h = 250;
  const tl = [["2019", "Primer commit en GitHub", false], ["2024", "Ingeniero de Sistemas · UNAD", false], ["HOY", "Arquitecto de Software · GC GROUP", false], ["2026", "Lanzando CISOiq", true]];
  const tlx = 500, tly = 66;
  const items = tl.map(([y, t, now], i) => {
    const yy = tly + i * 42;
    return `<circle cx="${tlx}" cy="${yy}" r="5" fill="${now ? T.hot : T.bg}" stroke="${now ? T.hot : T.ink}" stroke-width="2"${now ? ' class="pulse"' : ""}/>
<text x="${tlx + 18}" y="${yy - 2}" class="mono" font-size="11" letter-spacing="1" fill="${now ? T.hot : T.ink}">${y}</text>
<text x="${tlx + 18}" y="${yy + 16}" class="sora" font-size="13.5" fill="${T.sub}">${esc(t)}</text>`;
  }).join("");
  const lines = [
    [["Soy ", 400], ["Ingeniero de Sistemas", 700], [" (UNAD) y", 400]],
    [["Arquitecto de Software en GC GROUP", 700], [". Me gusta", 400]],
    [["llevar una idea de negocio hasta un producto en", 400]],
    [["producción: defino la arquitectura, escribo el", 400]],
    [["código, automatizo lo repetible y uso IA donde", 400]],
    [["de verdad aporta.", 400]],
  ];
  const para = lines.map((ln, i) => `<tspan x="28" y="${74 + i * 24}">${ln.map(([t, w]) => `<tspan font-weight="${w}"${w === 700 ? ` fill="${T.hi}"` : ""}>${esc(t)}</tspan>`).join("")}</tspan>`).join("");
  return svg(h, `${panel(h)}${labels("SOBRE MÍ", "TRAYECTORIA")}
<text class="sora" font-size="15" fill="${T.sub}">${para}</text>
<line x1="${tlx}" y1="${tly}" x2="${tlx}" y2="${tly + 126}" stroke="${T.line}"/>
${items}`, {
    fontKeys: ["sora-400", "sora-700", "mono-400"], title: "Sobre mí y trayectoria",
    css: `.pulse{animation:pulse 2s ease-in-out infinite}@keyframes pulse{50%{opacity:.45}}`,
  });
}

function stats(d) {
  const h = 196, tw = 186, gap = 12, x0 = 28, y0 = 56, th = 116;
  const years = new Date().getUTCFullYear() - new Date(d.createdAt).getUTCFullYear();
  // mensual (12 meses) para la línea de contribuciones
  const months = {}; for (const x of d.lastYear) { const k = x.date.slice(0, 7); months[k] = (months[k] || 0) + x.contributionCount; }
  const mv = Object.values(months).slice(-12);
  const mx = Math.max(1, ...mv);
  const pts = mv.map((v, i) => [12 + i * ((tw - 24) / (mv.length - 1 || 1)), 104 - (v / mx) * 26]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = line + ` L${pts.at(-1)[0].toFixed(1)} 106 L${pts[0][0].toFixed(1)} 106 Z`;
  // últimas 12 semanas en barras
  const wk = []; for (let i = d.lastYear.length - 84; i < d.lastYear.length; i += 7) wk.push(d.lastYear.slice(i, i + 7).reduce((a, x) => a + x.contributionCount, 0));
  const wmx = Math.max(1, ...wk);
  const bars = wk.map((v, i) => { const bh = Math.max(2, (v / wmx) * 26); return `<rect x="${12 + i * 14}" y="${106 - bh}" width="9" height="${bh}" rx="2" fill="${i === wk.length - 1 ? T.hot : T.ink}" opacity="${0.35 + 0.65 * (i / wk.length)}"/>`; }).join("");
  const dots = Array.from({ length: Math.min(d.repos, 30) }, (_, i) => `<rect x="${12 + (i % 15) * 11}" y="${84 + Math.floor(i / 15) * 11}" width="7" height="7" rx="2" fill="${T.ink}" opacity=".75"/>`).join("");
  const y1 = new Date(d.createdAt).getUTCFullYear(), y2 = new Date().getUTCFullYear();
  const ticks = Array.from({ length: y2 - y1 + 1 }, (_, i) => { const x = 14 + i * ((tw - 28) / (y2 - y1 || 1)); return `<circle cx="${x}" cy="96" r="${i === y2 - y1 ? 4 : 2.5}" fill="${i === y2 - y1 ? T.hot : T.ink}"/>`; }).join("");
  const tiles = [
    [fmt(d.yearTotal), "contribuciones · 12 meses", `<path d="${area}" fill="url(#ar)"/><path d="${line}" fill="none" stroke="${T.ink}" stroke-width="2" class="glow"/>`],
    [fmt(d.commits), "commits · 12 meses", bars],
    [fmt(d.repos), "repos públicos", dots],
    [String(years), "años en GitHub", `<line x1="14" y1="96" x2="${tw - 14}" y2="96" stroke="${T.line}"/>${ticks}`],
  ].map(([n, l, viz], i) => `<g transform="translate(${x0 + i * (tw + gap)} ${y0})">
<rect width="${tw}" height="${th}" rx="14" fill="url(#gl)" stroke="${T.line}"/>
<text x="16" y="42" class="sora" font-size="30" font-weight="700" letter-spacing="-.6" fill="url(#num)">${esc(n)}</text>
<text x="16" y="62" class="mono" font-size="10.5" fill="${T.mut}">${esc(l)}</text>${viz}</g>`).join("");
  return svg(h, `<defs>
<linearGradient id="num" x1="0" x2="1"><stop offset="0" stop-color="${T.hi}"/><stop offset="1" stop-color="${T.ink}"/></linearGradient>
<linearGradient id="gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7cc4ff" stop-opacity=".09"/><stop offset="1" stop-color="#7cc4ff" stop-opacity=".02"/></linearGradient>
<linearGradient id="ar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.ink}" stop-opacity=".35"/><stop offset="1" stop-color="${T.ink}" stop-opacity="0"/></linearGradient>
</defs>${panel(h)}${labels("ESTE AÑO", "SE ACTUALIZA CADA DÍA")}${tiles}`, {
    fontKeys: ["sora-700", "mono-400"], title: `Estadísticas: ${d.yearTotal} contribuciones, ${d.commits} commits, ${d.repos} repos`,
    css: `.glow{filter:drop-shadow(0 0 3px ${T.ink})}`,
  });
}

function streak(s) {
  const h = 230, cx = W / 2, cy = 124, r = 52, C = 2 * Math.PI * r;
  const ratio = s.longest.len ? Math.min(1, s.current.len / s.longest.len) : 0;
  const prog = Math.max(0.06, ratio) * C;
  const col = (x, n, k, dte) => `<text x="${x}" y="120" text-anchor="middle" class="sora" font-size="34" font-weight="700" letter-spacing="-.8" fill="${T.hi}">${esc(n)}</text>
<text x="${x}" y="148" text-anchor="middle" class="mono" font-size="10.5" letter-spacing="1.8" fill="${T.ink}">${esc(k)}</text>
<text x="${x}" y="168" text-anchor="middle" class="mono" font-size="11" fill="${T.mut}">${esc(dte)}</text>`;
  const curDays = s.current.len === 1 ? "día" : "días";
  return svg(h, `<defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${T.ink}"/><stop offset="1" stop-color="${T.hot}"/></linearGradient></defs>
${panel(h)}${labels("RACHA", "● EN VIVO", true)}
${col(170, fmt(s.total), "CONTRIBUCIONES TOTALES", `${fecha(s.first)} – hoy`)}
<line x1="300" y1="80" x2="300" y2="170" stroke="${T.line}"/><line x1="540" y1="80" x2="540" y2="170" stroke="${T.line}"/>
<circle cx="${cx}" cy="${cy - 8}" r="${r}" fill="none" stroke="rgba(124,196,255,.14)" stroke-width="6"/>
<circle cx="${cx}" cy="${cy - 8}" r="${r}" fill="none" stroke="url(#rg)" stroke-width="6" stroke-linecap="round" stroke-dasharray="${prog.toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 ${cx} ${cy - 8})" class="ring"/>
<text x="${cx}" y="${cy + 6}" text-anchor="middle" class="sora" font-size="40" font-weight="700" fill="${T.hot}">${s.current.len}</text>
<text x="${cx}" y="${cy + 24}" text-anchor="middle" class="mono" font-size="10" letter-spacing="1.6" fill="${T.hot}">${curDays.toUpperCase()}</text>
<text x="${cx}" y="${cy + 74}" text-anchor="middle" class="mono" font-size="10.5" letter-spacing="1.8" fill="${T.hot}">RACHA ACTUAL</text>
<text x="${cx}" y="${cy + 92}" text-anchor="middle" class="mono" font-size="11" fill="${T.mut}">${s.current.len ? (s.current.start === s.current.end ? fecha(s.current.end) : `${fecha(s.current.start, false)} – ${fecha(s.current.end)}`) : "empieza hoy"}</text>
${col(670, `${s.longest.len} ${s.longest.len === 1 ? "día" : "días"}`, "RACHA MÁS LARGA", s.longest.start ? `${fecha(s.longest.start, false)} – ${fecha(s.longest.end)}` : "—")}`, {
    fontKeys: ["sora-700", "mono-400"], title: `Racha: ${s.total} contribuciones totales, actual ${s.current.len}, más larga ${s.longest.len}`,
    css: `.ring{filter:drop-shadow(0 0 5px rgba(255,181,71,.55));animation:grow 1.6s ease-out both}
@keyframes grow{from{stroke-dasharray:0 ${C.toFixed(1)}}}`,
  });
}

function projects() {
  const h = 306, cw = 254, gap = 13, y0 = 56, ch = 222;
  const P = [
    { st: "EN PRODUCCIÓN", hot: true, name: ["CISOiq"], desc: ["Plataforma SaaS B2B de", "inteligencia estratégica de", "ciberseguridad para CISOs."], tags: ["saas", "security", "typescript"], url: "app.cisoiq.app ↗" },
    { st: "ACTIVO", hot: true, name: ["iQData"], desc: ["Constructor de formularios", "dinámicos para capturar y", "organizar datos."], tags: ["forms", "low-code"], url: "iqdata.com.co ↗" },
    { st: "OPEN SOURCE", hot: false, name: ["local-meeting-", "analyzer"], desc: ["Graba y analiza reuniones 100%", "en local con Whisper + Ollama."], tags: ["ai", "privacy"], url: "ver demo ↗" },
  ];
  const cards = P.map((p, i) => {
    const c = p.hot ? T.hot : T.ink;
    const nameY = 70; const descY = nameY + 18 + (p.name.length - 1) * 24 + 10;
    let tx = 18; const tags = p.tags.map((t) => { const w = monoW(t, 10) + 18; const g = `<rect x="${tx}" y="${ch - 64}" width="${w}" height="20" rx="10" fill="none" stroke="${T.line}"/><text x="${tx + 9}" y="${ch - 50}" class="mono" font-size="10" fill="${T.ink}">${esc(t)}</text>`; tx += w + 6; return g; }).join("");
    return `<g transform="translate(${28 + i * (cw + gap)} ${y0})">
<rect width="${cw}" height="${ch}" rx="14" fill="url(#gl)" stroke="${T.line}"/>
<circle cx="${cw - 20}" cy="18" r="60" fill="${T.b}" opacity=".22" filter="url(#soft)"/>
<circle cx="22" cy="28" r="3" fill="${c}" class="glow"/><text x="32" y="32" class="mono" font-size="10.5" letter-spacing="1.2" fill="${c}">${p.st}</text>
<text class="sora" font-size="20" font-weight="700" letter-spacing="-.3" fill="${T.hi}">${p.name.map((n, j) => `<tspan x="18" y="${nameY - 6 + j * 24}">${esc(n)}</tspan>`).join("")}</text>
<text class="sora" font-size="13" fill="${T.sub}">${p.desc.map((n, j) => `<tspan x="18" y="${descY + j * 19}">${esc(n)}</tspan>`).join("")}</text>
${tags}<text x="18" y="${ch - 20}" class="mono" font-size="11" fill="${T.ink}">${esc(p.url)}</text></g>`;
  }).join("");
  return svg(h, `<defs>
<linearGradient id="gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7cc4ff" stop-opacity=".09"/><stop offset="1" stop-color="#7cc4ff" stop-opacity=".02"/></linearGradient>
<filter id="soft" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="28"/></filter>
<clipPath id="cl"><rect width="${W}" height="${h}" rx="16"/></clipPath></defs>
${panel(h)}${labels("PRODUCTOS", "EN CONSTRUCCIÓN Y PUBLICADOS")}<g clip-path="url(#cl)">${cards}</g>`, {
    fontKeys: ["sora-400", "sora-700", "mono-400"], title: "Productos: CISOiq, iQData y local-meeting-analyzer",
    css: `.glow{filter:drop-shadow(0 0 4px currentColor)}`,
  });
}

function stack() {
  const h = 212, bw = 168, bh = 48, cols = [28, 228, 428, 628], r1 = 82, r2 = 140;
  const L = [
    ["FRONTEND", [["react", "#61dafb", "#0a1626", "React", "interfaces web"], ["angular", "#dd0031", "#fff", "Angular", "apps empresariales"]]],
    ["BACKEND", [["nodedotjs", "#5fa04e", "#fff", "Node.js", "APIs y servicios"], ["typescript", "#3178c6", "#fff", "TypeScript", "todo el código"]]],
    ["DATOS", [["supabase", "#3ecf8e", "#0a1626", "Supabase", "auth · storage"], ["postgresql", "#4169e1", "#fff", "PostgreSQL", "base de datos"]]],
    ["OPS · IA", [["n8n", "#ea4b71", "#fff", "n8n", "automatización"], ["vercel", "#e9f4ff", "#0a1626", "Vercel", "deploy · Ollama IA"]]],
  ];
  const box = (x, y, [ic, bg, fg, name, role], hi) => `<g transform="translate(${x} ${y})">
<rect width="${bw}" height="${bh}" rx="11" fill="${T.glass}" stroke="${hi ? T.ink : T.line}" stroke-opacity="${hi ? 0.6 : 1}"/>
<rect x="10" y="11" width="26" height="26" rx="7" fill="${bg}"/>
<svg x="15" y="16" width="16" height="16" viewBox="0 0 24 24"><path d="${ICONS[ic]}" fill="${fg}"/></svg>
<text x="46" y="22" class="sora" font-size="14" font-weight="700" fill="${T.hi}">${esc(name)}</text>
<text x="46" y="37" class="mono" font-size="9.5" fill="${T.mut}">${esc(role)}</text></g>`;
  const boxes = L.map(([lab, items], i) => `<text class="lbl" x="${cols[i]}" y="${r1 - 12}" font-size="10" letter-spacing="1.6">${lab}</text>` + items.map((it, j) => box(cols[i], j ? r2 : r1, it, !j)).join("")).join("");
  const m1 = r1 + bh / 2, m2 = r2 + bh / 2, e = (i) => cols[i] + bw, s = (i) => cols[i + 1];
  const wires = `M${e(0)} ${m1}H${s(0)} M${e(0)} ${m2}C${e(0) + 16} ${m2} ${e(0) + 16} ${m1} ${s(0)} ${m1} M${e(1)} ${m1}H${s(1)} M${e(1)} ${m2}H${s(1)} M${e(1)} ${m1}C${e(1) + 16} ${m1} ${e(1) + 16} ${m2} ${s(1)} ${m2} M${e(2)} ${m1}H${s(2)} M${e(2)} ${m2}H${s(2)}`;
  const flow = `M${e(0)} ${m1}H${s(0)} M${e(1)} ${m1}H${s(1)} M${e(2)} ${m2}H${s(2)}`;
  const route = `M${cols[0] + bw / 2} ${m1}H${cols[1] + bw / 2}H${cols[2] + bw / 2}V${m2}H${cols[3] + bw / 2}`;
  return svg(h, `${panel(h)}${labels("ARQUITECTURA DEL STACK", "CAPA → CAPA")}
<path d="${wires}" fill="none" stroke="${T.ink}" stroke-width="1.3" opacity=".45"/>
<path d="${flow}" fill="none" stroke="${T.hot}" stroke-width="1.6" stroke-dasharray="5 7" class="flow"/>
${boxes}
<circle r="4" fill="${T.hot}" class="pk"><animateMotion dur="5s" repeatCount="indefinite" path="${route}"/></circle>`, {
    fontKeys: ["sora-700", "mono-400"], title: "Stack: React, Angular, Node.js, TypeScript, Supabase, PostgreSQL, n8n, Vercel",
    css: `.flow{animation:flow 1.1s linear infinite}@keyframes flow{to{stroke-dashoffset:-12}}.pk{filter:drop-shadow(0 0 5px ${T.hot})}`,
  });
}

function contrib(d) {
  const top = 52, availW = W - 56;
  let h = 214, availH = h - top - 22;
  let inner;
  if (existsSync(SNAKE)) {
    const raw = readFileSync(SNAKE, "utf8").replace(/<\?xml[^>]*>/, "");
    const vb = raw.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 880 192";
    const [, , vw, vh] = vb.split(/[\s,]+/).map(Number);
    if (vw > 0 && vh > 0) { availH = Math.round((availW * vh) / vw); h = top + availH + 18; } // ocupar todo el ancho
    inner = raw.replace(/^\s*<svg[^>]*>/, `<svg x="28" y="${top}" width="${availW}" height="${availH}" viewBox="${vb}" preserveAspectRatio="xMidYMid meet">`);
  } else {
    // Respaldo estático (sin serpiente) con los datos del último año
    const cell = 12, gap = 3, weeks = Math.ceil(d.lastYear.length / 7);
    const max = Math.max(1, ...d.lastYear.map((x) => x.contributionCount));
    const lv = ["rgba(124,196,255,.08)", "rgba(124,196,255,.28)", "rgba(124,196,255,.5)", T.ink, T.hi];
    const ox = 28 + (availW - weeks * (cell + gap)) / 2;
    inner = d.lastYear.map((x, i) => { const l = x.contributionCount ? Math.min(4, Math.ceil((x.contributionCount / max) * 4)) : 0;
      return `<rect x="${(ox + Math.floor(i / 7) * (cell + gap)).toFixed(1)}" y="${top + 10 + (i % 7) * (cell + gap)}" width="${cell}" height="${cell}" rx="3" fill="${lv[l]}"/>`; }).join("");
  }
  return svg(h, `${panel(h)}${labels("CONTRIBUCIONES", "LA SERPIENTE RECORRE TU AÑO")}${inner}`, { fontKeys: ["mono-400"], title: "Gráfico de contribuciones con serpiente" });
}

function cta() {
  const h = 132;
  return svg(h, `<defs><linearGradient id="wv" x1="0" x2="1"><stop offset="0" stop-color="${T.a}"/><stop offset=".5" stop-color="${T.b}"/><stop offset="1" stop-color="${T.c}"/></linearGradient></defs>
${panel(h)}
<text x="${W / 2}" y="60" text-anchor="middle" class="sora" font-size="26" font-weight="700" letter-spacing="-.4" fill="${T.hi}">¿Construimos algo juntos?</text>
<text x="${W / 2}" y="90" text-anchor="middle" class="sora" font-size="14" fill="${T.sub}">Arquitectura, SaaS a medida y automatización para tu empresa.</text>`, { fontKeys: ["sora-700", "sora-400"], title: "¿Construimos algo juntos?" });
}

function button(text, primary) {
  const w = Math.round(monoW(text, 13) + 44), h = 42;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(text)}"><title>${esc(text)}</title>
<style>${fonts("mono-700")}</style>
<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="11" fill="${primary ? T.hot : T.bg}" stroke="${primary ? T.hot : T.line}"/>
<text x="${w / 2}" y="26" text-anchor="middle" font-family="${MONO}" font-size="13" font-weight="700" fill="${primary ? "#1a1205" : T.hi}">${esc(text)}</text></svg>`;
}

function footer() {
  const h = 70;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" role="img" aria-label=""><defs><linearGradient id="wv" x1="0" x2="1"><stop offset="0" stop-color="${T.a}"/><stop offset=".5" stop-color="${T.b}"/><stop offset="1" stop-color="${T.c}"/></linearGradient></defs>
<path d="M0 34 C 140 6, 280 6, 420 30 S 700 58, 840 22 V70 H0 Z" fill="url(#wv)" opacity=".55"/>
<path d="M0 46 C 160 22, 300 30, 440 46 S 720 64, 840 40 V70 H0 Z" fill="url(#wv)"/></svg>`;
}

/* ---------- Ejecutar ---------- */
const d = await loadData();
const s = streaks(d.allDays);
const files = {
  "hero.svg": hero(), "about.svg": about(), "stats.svg": stats(d), "streak.svg": streak(s),
  "projects.svg": projects(), "stack.svg": stack(), "contrib.svg": contrib(d), "cta.svg": cta(),
  "btn-portfolio.svg": button("edixonpabon.com ↗", true), "btn-linkedin.svg": button("LinkedIn ↗", false), "footer.svg": footer(),
};
for (const [n, c] of Object.entries(files)) writeFileSync(join(OUT, n), c);
console.log(`Listo: ${Object.keys(files).length} SVG · ${d.yearTotal} contrib. 12m · total ${s.total} · racha ${s.current.len} · máx ${s.longest.len}`);
