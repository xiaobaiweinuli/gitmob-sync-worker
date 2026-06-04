/**
 * GitMob Sync Worker — 落地页
 * 面向自托管用户：运行状态、配置引导、相关项目链接
 * 自动深浅色 + 响应式，风格与认证 Worker 落地页保持一致
 */

export interface LandingEnv {
  DB: D1Database;
  FAV_SYNC_DO: DurableObjectNamespace;
  WORKER_VERSION: string;
}

// ─── 常量 ────────────────────────────────────────────────────────────────────

const REPO_URL      = "https://github.com/xiaobaiweinuli/GitMob-Android";
const APP_RELEASE   = `${REPO_URL}/releases`;
// 插件链接占位，上架后替换
const EXT_CHROME    = "https://chromewebstore.google.com/";
const EXT_FIREFOX   = "https://addons.mozilla.org/";
const SYNC_REPO_URL = "https://github.com/xiaobaiweinuli/gitmob-sync-worker";

// ─── 国际化 ──────────────────────────────────────────────────────────────────

type Lang = "zh" | "en" | "ja" | "ko" | "es";
const LANGS: Lang[] = ["zh", "en", "ja", "ko", "es"];

interface I18n {
  pageTitle: string;
  tagline: string;
  statusTitle: string;
  statusWorker: string;
  statusDb: string;
  statusWs: string;
  statusOk: string;
  statusErr: string;
  setupTitle: string;
  setupSteps: string[];
  copyBtn: string;
  copiedBtn: string;
  projectsTitle: string;
  projectApp: string;
  projectExt: string;
  projectSrc: string;
  footer: string;
}

const i18n: Record<Lang, I18n> = {
  zh: {
    pageTitle:   "GitMob 同步服务",
    tagline:     "为 GitMob App 与浏览器插件提供收藏夹跨设备实时同步",
    statusTitle: "服务状态",
    statusWorker:"Worker",
    statusDb:    "D1 数据库",
    statusWs:    "WebSocket (DO)",
    statusOk:    "正常",
    statusErr:   "异常",
    setupTitle:  "配置步骤",
    setupSteps: [
      "复制本页面地址（见下方按钮）",
      "打开 GitMob App → 设置 → 云端同步 → 粘贴地址",
      "点击「测试连接」，显示「连接正常」即完成",
      "浏览器插件同理：设置 → 同步服务地址 → 粘贴并验证",
    ],
    copyBtn:      "📋 复制服务地址",
    copiedBtn:    "✓ 已复制",
    projectsTitle:"相关项目",
    projectApp:   "📱 GitMob App",
    projectExt:   "🧩 浏览器插件",
    projectSrc:   "📦 同步服务源码",
    footer:       "GitMob Sync Worker · 基于 Cloudflare Workers + D1 + Durable Objects",
  },
  en: {
    pageTitle:   "GitMob Sync Service",
    tagline:     "Real-time cross-device favorites sync for GitMob App & browser extension",
    statusTitle: "Service Status",
    statusWorker:"Worker",
    statusDb:    "D1 Database",
    statusWs:    "WebSocket (DO)",
    statusOk:    "OK",
    statusErr:   "Error",
    setupTitle:  "Setup Guide",
    setupSteps: [
      "Copy this page's URL (see button below)",
      "Open GitMob App → Settings → Cloud Sync → Paste URL",
      "Tap \"Test Connection\" — you should see \"Connected\"",
      "Same for the browser extension: Settings → Sync URL → Paste & verify",
    ],
    copyBtn:      "📋 Copy Service URL",
    copiedBtn:    "✓ Copied",
    projectsTitle:"Related Projects",
    projectApp:   "📱 GitMob App",
    projectExt:   "🧩 Browser Extension",
    projectSrc:   "📦 Sync Worker Source",
    footer:       "GitMob Sync Worker · Powered by Cloudflare Workers + D1 + Durable Objects",
  },
  ja: {
    pageTitle:   "GitMob 同期サービス",
    tagline:     "GitMob App とブラウザ拡張機能のクロスデバイスリアルタイム同期",
    statusTitle: "サービスステータス",
    statusWorker:"Worker",
    statusDb:    "D1 データベース",
    statusWs:    "WebSocket (DO)",
    statusOk:    "正常",
    statusErr:   "エラー",
    setupTitle:  "設定手順",
    setupSteps: [
      "このページの URL をコピー（下のボタン）",
      "GitMob App → 設定 → クラウド同期 → URL を貼り付け",
      "「接続テスト」をタップ → 「接続成功」と表示されれば完了",
      "ブラウザ拡張も同様：設定 → 同期 URL → 貼り付けて確認",
    ],
    copyBtn:      "📋 URL をコピー",
    copiedBtn:    "✓ コピー済み",
    projectsTitle:"関連プロジェクト",
    projectApp:   "📱 GitMob App",
    projectExt:   "🧩 ブラウザ拡張",
    projectSrc:   "📦 ソースコード",
    footer:       "GitMob Sync Worker · Cloudflare Workers + D1 + Durable Objects",
  },
  ko: {
    pageTitle:   "GitMob 동기화 서비스",
    tagline:     "GitMob App과 브라우저 확장의 크로스 디바이스 실시간 즐겨찾기 동기화",
    statusTitle: "서비스 상태",
    statusWorker:"Worker",
    statusDb:    "D1 데이터베이스",
    statusWs:    "WebSocket (DO)",
    statusOk:    "정상",
    statusErr:   "오류",
    setupTitle:  "설정 방법",
    setupSteps: [
      "이 페이지 주소 복사 (아래 버튼)",
      "GitMob App → 설정 → 클라우드 동기화 → 주소 붙여넣기",
      "「연결 테스트」탭 → 「연결됨」표시 확인",
      "브라우저 확장도 동일: 설정 → 동기화 URL → 붙여넣기",
    ],
    copyBtn:      "📋 주소 복사",
    copiedBtn:    "✓ 복사됨",
    projectsTitle:"관련 프로젝트",
    projectApp:   "📱 GitMob App",
    projectExt:   "🧩 브라우저 확장",
    projectSrc:   "📦 소스코드",
    footer:       "GitMob Sync Worker · Cloudflare Workers + D1 + Durable Objects",
  },
  es: {
    pageTitle:   "GitMob Servicio de Sincronización",
    tagline:     "Sincronización en tiempo real entre GitMob App y extensión del navegador",
    statusTitle: "Estado del Servicio",
    statusWorker:"Worker",
    statusDb:    "Base de datos D1",
    statusWs:    "WebSocket (DO)",
    statusOk:    "OK",
    statusErr:   "Error",
    setupTitle:  "Guía de Configuración",
    setupSteps: [
      "Copia la URL de esta página (botón de abajo)",
      "Abre GitMob App → Ajustes → Sincronización → Pega la URL",
      "Toca «Probar conexión» → debe mostrar «Conectado»",
      "Lo mismo para la extensión: Ajustes → URL de sincronización",
    ],
    copyBtn:      "📋 Copiar URL",
    copiedBtn:    "✓ Copiado",
    projectsTitle:"Proyectos Relacionados",
    projectApp:   "📱 GitMob App",
    projectExt:   "🧩 Extensión",
    projectSrc:   "📦 Código fuente",
    footer:       "GitMob Sync Worker · Cloudflare Workers + D1 + Durable Objects",
  },
};

// ─── 语言检测（与认证 Worker 逻辑一致）───────────────────────────────────────

function countryToLang(c: string | undefined): Lang {
  if (!c) return "en";
  const u = c.toUpperCase();
  if (["CN","TW","HK","MO","SG"].includes(u)) return "zh";
  if (u === "JP") return "ja";
  if (u === "KR") return "ko";
  if (["ES","MX","AR","CL","CO","PE","VE","EC","BO","PY","UY",
       "GT","HN","SV","NI","CR","PA","DO","CU","PR"].includes(u)) return "es";
  return "en";
}

function getCookieLang(cookie: string | null): Lang | null {
  const m = cookie?.match(/gitmob-lang=([a-z]{2})/);
  if (!m) return null;
  const l = m[1] as Lang;
  return LANGS.includes(l) ? l : null;
}

export function detectLang(request: Request, url: URL): Lang {
  const param = url.searchParams.get("lang") as Lang | null;
  if (param && LANGS.includes(param)) return param;
  const cookie = getCookieLang(request.headers.get("Cookie"));
  if (cookie) return cookie;
  const geo = countryToLang((request.cf as any)?.country);
  if (geo !== "en") return geo;
  const al = request.headers.get("Accept-Language") ?? "";
  if (al.startsWith("zh")) return "zh";
  if (al.startsWith("ja")) return "ja";
  if (al.startsWith("ko")) return "ko";
  if (al.startsWith("es")) return "es";
  return "en";
}

// ─── 状态检测 ────────────────────────────────────────────────────────────────

interface StatusResult {
  worker: boolean;
  db:     boolean;
  ws:     boolean;
}

async function checkStatus(env: LandingEnv): Promise<StatusResult> {
  // Worker 能运行到这里就是正常
  let db = false;
  let ws = false;

  // D1：执行最轻量的查询
  try {
    await env.DB.prepare("SELECT 1").first();
    db = true;
  } catch { /* db = false */ }

  // DO：尝试获取 stub（不建立 WS，仅验证 DO 可用性）
  try {
    env.FAV_SYNC_DO.idFromName("__health_check__");
    ws = true;
  } catch { /* ws = false */ }

  return { worker: true, db, ws };
}

// ─── HTML 生成 ───────────────────────────────────────────────────────────────

export async function handleLanding(
  request: Request,
  url: URL,
  env: LandingEnv,
): Promise<Response> {
  const lang      = detectLang(request, url);
  const t         = i18n[lang];
  const paramLang = url.searchParams.get("lang");
  const status    = await checkStatus(env);
  const version   = env.WORKER_VERSION ?? "1.0";
  const selfUrl   = `${url.protocol}//${url.host}`;

  // 全部状态正常则显示绿色总体状态
  const allOk = status.worker && status.db && status.ws;

  // 语言菜单
  const langOptions: Array<{ code: Lang; label: string }> = [
    { code: "zh", label: "中文" },
    { code: "en", label: "English" },
    { code: "ja", label: "日本語" },
    { code: "ko", label: "한국어" },
    { code: "es", label: "Español" },
  ];
  const langMenuItems = langOptions.map(o =>
    `<a href="?lang=${o.code}" class="lang-item${lang === o.code ? " active" : ""}" rel="nofollow">${o.label}</a>`
  ).join("\n        ");

  // 配置步骤列表
  const stepsHtml = t.setupSteps.map((s, i) =>
    `<li><span class="step-num">${i + 1}</span><span>${s}</span></li>`
  ).join("\n        ");

  // 状态行渲染函数
  const statusRow = (label: string, ok: boolean, t: I18n) =>
    `<div class="status-row">
      <span class="status-dot ${ok ? "ok" : "err"}"></span>
      <span class="status-label">${label}</span>
      <span class="status-val ${ok ? "ok" : "err"}">${ok ? t.statusOk : t.statusErr}</span>
    </div>`;

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${t.pageTitle}</title>
  <meta name="description" content="${t.tagline}">
  <meta name="robots" content="noindex">
  <link rel="icon" href="/logo.png" type="image/png">
  <style>
    /* ── CSS 变量（深色为默认，浅色通过 data-theme 覆盖）── */
    :root {
      --accent:   #FF6B4A;
      --accent-dim: rgba(255,107,74,.12);
      --bg:       #0F1117;
      --card:     #161B25;
      --card2:    #1E2535;
      --border:   #2A3347;
      --text:     #E8EAF0;
      --sub:      #9BA3BA;
      --ok:       #3FB950;
      --ok-dim:   rgba(63,185,80,.12);
      --err:      #F85149;
      --err-dim:  rgba(248,81,73,.12);
      --radius:   28px;
      --shadow:   0 32px 64px -16px rgba(0,0,0,.45);
    }
    [data-theme="light"] {
      --bg:     #F5F7FA;
      --card:   #FFFFFF;
      --card2:  #F1F5F9;
      --border: #E2E8F0;
      --text:   #0F172A;
      --sub:    #64748B;
      --shadow: 0 16px 40px -8px rgba(0,0,0,.10);
    }

    /* ── Reset & Base ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 32px 16px 64px;
      transition: background .4s, color .4s;
    }

    /* ── 主卡片 ── */
    @keyframes fadeUp { from { opacity:0; transform:translateY(32px) } to { opacity:1; transform:translateY(0) } }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      width: 100%;
      max-width: 680px;
      padding: 52px 48px 48px;
      animation: fadeUp .7s cubic-bezier(.4,0,.2,1) backwards;
      position: relative;
    }

    /* ── 右上角控件 ── */
    .controls {
      position: absolute;
      top: 24px; right: 24px;
      display: flex; gap: 6px; align-items: center;
    }
    .icon-btn {
      width: 42px; height: 42px;
      border: none; background: transparent;
      font-size: 20px; cursor: pointer;
      color: var(--sub); border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      transition: background .2s;
    }
    .icon-btn:hover { background: var(--card2); }
    .lang-selector { position: relative; }
    .lang-menu {
      display: none; position: absolute; right: 0; top: 48px;
      background: var(--card); border: 1px solid var(--border);
      border-radius: 14px; padding: 6px; min-width: 110px;
      box-shadow: 0 8px 24px rgba(0,0,0,.25); z-index: 200;
    }
    .lang-menu.open { display: block; }
    .lang-item {
      display: block; padding: 9px 14px;
      text-decoration: none; color: var(--text);
      border-radius: 9px; font-size: 14px;
      transition: background .15s;
    }
    .lang-item:hover { background: var(--card2); }
    .lang-item.active { color: var(--accent); font-weight: 600; }

    /* ── Header ── */
    .header {
      display: flex;
      align-items: center;
      gap: 20px;
      margin-bottom: 32px;
    }
    @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
    .logo {
      width: 72px; height: 72px;
      border-radius: 18px;
      flex-shrink: 0;
      animation: float 3.5s ease-in-out infinite;
      box-shadow: 0 12px 24px -6px rgba(0,0,0,.25);
    }
    .header-text h1 {
      font-size: 26px; font-weight: 700;
      letter-spacing: -.5px; color: var(--accent);
      line-height: 1.2; margin-bottom: 4px;
    }
    .header-text .tagline {
      font-size: 14px; color: var(--sub); line-height: 1.5;
    }
    .badge {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 3px 10px;
      background: var(--${allOk ? "ok" : "err"}-dim);
      color: var(--${allOk ? "ok" : "err"});
      border-radius: 999px; font-size: 12px; font-weight: 600;
      margin-top: 8px;
    }
    .badge::before {
      content: "";
      width: 7px; height: 7px; border-radius: 50%;
      background: var(--${allOk ? "ok" : "err"});
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%,100% { opacity: 1; transform: scale(1); }
      50%      { opacity: .5; transform: scale(.8); }
    }

    /* ── 分区通用 ── */
    .section { margin-top: 32px; }
    .section-title {
      font-size: 12px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 1px;
      color: var(--sub); margin-bottom: 14px;
    }

    /* ── 状态卡 ── */
    .status-card {
      background: var(--card2);
      border: 1px solid var(--border);
      border-radius: 18px;
      overflow: hidden;
    }
    .status-row {
      display: flex; align-items: center; gap: 12px;
      padding: 14px 20px;
      border-bottom: 1px solid var(--border);
    }
    .status-row:last-child { border-bottom: none; }
    .status-dot {
      width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
    }
    .status-dot.ok  { background: var(--ok);  box-shadow: 0 0 0 3px var(--ok-dim); }
    .status-dot.err { background: var(--err); box-shadow: 0 0 0 3px var(--err-dim); }
    .status-label { font-size: 14px; color: var(--text); flex: 1; }
    .status-val { font-size: 13px; font-weight: 600; }
    .status-val.ok  { color: var(--ok); }
    .status-val.err { color: var(--err); }
    .version-row {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 20px;
      background: var(--accent-dim);
      border-top: 1px solid var(--border);
    }
    .version-row .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }
    .version-row span { font-size: 13px; color: var(--accent); font-weight: 600; }

    /* ── 配置步骤 ── */
    .steps {
      list-style: none;
      background: var(--card2);
      border: 1px solid var(--border);
      border-radius: 18px;
      overflow: hidden;
    }
    .steps li {
      display: flex; align-items: flex-start; gap: 14px;
      padding: 15px 20px;
      border-bottom: 1px solid var(--border);
      font-size: 14px; line-height: 1.55; color: var(--text);
    }
    .steps li:last-child { border-bottom: none; }
    .step-num {
      width: 24px; height: 24px;
      background: var(--accent-dim); color: var(--accent);
      border-radius: 50%; font-size: 12px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; margin-top: 1px;
    }

    /* ── 复制地址按钮 ── */
    .url-box {
      display: flex; gap: 10px; align-items: stretch;
      margin-top: 16px;
    }
    .url-display {
      flex: 1;
      background: var(--card2);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 12px 16px;
      font-family: "SF Mono", "Fira Code", Consolas, monospace;
      font-size: 13px; color: var(--sub);
      word-break: break-all;
      line-height: 1.5;
    }
    .copy-btn {
      padding: 0 20px;
      background: var(--accent);
      color: #fff; border: none; border-radius: 14px;
      font-size: 14px; font-weight: 600; cursor: pointer;
      white-space: nowrap;
      transition: opacity .2s, transform .15s;
      flex-shrink: 0;
    }
    .copy-btn:hover  { opacity: .88; }
    .copy-btn:active { transform: scale(.97); }
    .copy-btn.copied {
      background: var(--ok);
    }

    /* ── 相关项目链接 ── */
    .projects {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    .proj-link {
      display: flex; flex-direction: column;
      align-items: center; gap: 8px;
      padding: 18px 12px;
      background: var(--card2);
      border: 1px solid var(--border);
      border-radius: 18px;
      text-decoration: none; color: var(--text);
      font-size: 13px; font-weight: 600; text-align: center;
      transition: border-color .2s, transform .2s, box-shadow .2s;
      line-height: 1.4;
    }
    .proj-link:hover {
      border-color: var(--accent);
      transform: translateY(-3px);
      box-shadow: 0 8px 20px -4px rgba(255,107,74,.15);
    }
    .proj-icon { font-size: 28px; }

    /* ── Footer ── */
    .footer {
      margin-top: 40px;
      text-align: center;
      font-size: 12.5px;
      color: var(--sub);
      opacity: .75;
      line-height: 1.6;
    }

    /* ── 响应式 ── */
    @media (max-width: 600px) {
      body  { padding: 16px 12px 48px; }
      .card { padding: 36px 22px 32px; }
      .controls { top: 16px; right: 16px; }
      .header { gap: 14px; margin-bottom: 24px; }
      .logo  { width: 56px; height: 56px; border-radius: 14px; }
      .header-text h1 { font-size: 21px; }
      .projects { grid-template-columns: 1fr 1fr; }
      .url-box  { flex-direction: column; }
      .copy-btn { width: 100%; padding: 12px; }
    }
    @media (max-width: 360px) {
      .projects { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="card">

    <!-- 右上角：语言切换 + 深浅色 -->
    <div class="controls">
      <div class="lang-selector">
        <button class="icon-btn" id="langBtn" aria-label="Language" aria-expanded="false">🌐</button>
        <div class="lang-menu" id="langMenu" role="menu">
          ${langMenuItems}
        </div>
      </div>
      <button class="icon-btn" id="themeToggle" aria-label="Toggle theme">🌙</button>
    </div>

    <!-- Header：Logo + 标题 + 运行状态徽章 -->
    <div class="header">
      <img src="/logo.png" alt="GitMob" class="logo" width="72" height="72">
      <div class="header-text">
        <h1>${t.pageTitle}</h1>
        <p class="tagline">${t.tagline}</p>
        <div class="badge">${allOk ? t.statusOk : t.statusErr}</div>
      </div>
    </div>

    <!-- 服务状态 -->
    <div class="section">
      <div class="section-title">${t.statusTitle}</div>
      <div class="status-card">
        ${statusRow(t.statusWorker, status.worker, t)}
        ${statusRow(t.statusDb,     status.db,     t)}
        ${statusRow(t.statusWs,     status.ws,     t)}
        <div class="version-row">
          <div class="dot"></div>
          <span>v${version}</span>
        </div>
      </div>
    </div>

    <!-- 配置步骤 -->
    <div class="section">
      <div class="section-title">${t.setupTitle}</div>
      <ul class="steps">
        ${stepsHtml}
      </ul>
      <!-- 服务地址 + 复制按钮 -->
      <div class="url-box">
        <div class="url-display" id="selfUrl">${selfUrl}</div>
        <button class="copy-btn" id="copyBtn">${t.copyBtn}</button>
      </div>
    </div>

    <!-- 相关项目 -->
    <div class="section">
      <div class="section-title">${t.projectsTitle}</div>
      <div class="projects">
        <a href="${APP_RELEASE}" class="proj-link" target="_blank" rel="noopener noreferrer">
          <span class="proj-icon">📱</span>
          <span>${t.projectApp}</span>
        </a>
        <a href="${EXT_CHROME}" class="proj-link" target="_blank" rel="noopener noreferrer">
          <span class="proj-icon">🧩</span>
          <span>${t.projectExt}</span>
        </a>
        <a href="${SYNC_REPO_URL}" class="proj-link" target="_blank" rel="noopener noreferrer">
          <span class="proj-icon">📦</span>
          <span>${t.projectSrc}</span>
        </a>
      </div>
    </div>

    <div class="footer">${t.footer}</div>
  </div>

  <script>
    // ── 深浅色切换（跟随系统，支持手动覆盖）──
    var html = document.documentElement;
    var toggle = document.getElementById('themeToggle');
    function setTheme(t) {
      html.setAttribute('data-theme', t);
      toggle.textContent = t === 'dark' ? '☀️' : '🌙';
      localStorage.setItem('gitmob-sync-theme', t);
    }
    var saved = localStorage.getItem('gitmob-sync-theme');
    setTheme(saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    // 跟随系统变化（未手动设置时）
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
      if (!localStorage.getItem('gitmob-sync-theme')) setTheme(e.matches ? 'dark' : 'light');
    });
    toggle.addEventListener('click', function() {
      var cur = html.getAttribute('data-theme') || 'dark';
      var next = cur === 'dark' ? 'light' : 'dark';
      localStorage.setItem('gitmob-sync-theme', next); // 手动设置后持久化
      setTheme(next);
    });

    // ── 语言菜单 ──
    var langBtn  = document.getElementById('langBtn');
    var langMenu = document.getElementById('langMenu');
    langBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var open = langMenu.classList.toggle('open');
      langBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function() {
      langMenu.classList.remove('open');
      langBtn.setAttribute('aria-expanded', 'false');
    });
    langMenu.addEventListener('click', function(e) { e.stopPropagation(); });

    // ── 复制服务地址 ──
    var copyBtn  = document.getElementById('copyBtn');
    var copiedLabel = ${JSON.stringify(t.copiedBtn)};
    var copyLabel   = ${JSON.stringify(t.copyBtn)};
    copyBtn.addEventListener('click', function() {
      var url = document.getElementById('selfUrl').textContent.trim();
      navigator.clipboard.writeText(url).then(function() {
        copyBtn.textContent = copiedLabel;
        copyBtn.classList.add('copied');
        setTimeout(function() {
          copyBtn.textContent = copyLabel;
          copyBtn.classList.remove('copied');
        }, 2000);
      });
    });
  </script>
</body>
</html>`;

  const headers = new Headers({
    "Content-Type": "text/html;charset=UTF-8",
    "Cache-Control": "no-store",  // 状态信息不缓存
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
  });

  if (paramLang && LANGS.includes(paramLang as Lang)) {
    headers.set("Set-Cookie",
      `gitmob-lang=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`);
  }

  return new Response(html, { headers });
}
