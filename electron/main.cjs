const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;

/** Load KEY=value pairs from a project-root .env (gitignored) without overriding real env vars. */
function loadDotEnv() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m || line.trim().startsWith('#')) continue;
      const val = m[2].replace(/^(['"])(.*)\1$/, '$2');
      if (process.env[m[1]] === undefined) process.env[m[1]] = val;
    }
  } catch {
    /* no .env — fine */
  }
}
loadDotEnv();

const JEV_TYPES = new Set(['noul', 'choice', 'score']);
let jevClient = null;

function getJevClient() {
  if (jevClient) return jevClient;
  const { TypeSafeClient } = require('@typesafe-ai/sdk');
  jevClient = new TypeSafeClient({
    apiKey: process.env.TYPESAFE_API_KEY,
    // Pin a model version here once thresholds are tuned (see README); default is jev-latest.
    defaultModel: process.env.TYPESAFE_MODEL || undefined,
    timeout: 15000,
    retry: { maxRetries: 1 },
    compression: false, // Electron 33 ships Node 20; zstd needs 22.15+
  });
  return jevClient;
}

/** Cheap shape check so the renderer can only send well-formed system_one requests. */
function validateJevRequest(req) {
  if (!req || typeof req !== 'object') return 'bad request';
  if (!req.state || typeof req.state !== 'object') return 'bad state';
  if (JSON.stringify(req.state).length > 60000) return 'state too large';
  const qs = req.questions;
  if (!qs || typeof qs !== 'object') return 'bad questions';
  const names = Object.keys(qs);
  if (names.length < 1 || names.length > 16) return 'bad question count';
  for (const n of names) {
    const q = qs[n];
    if (!q || !JEV_TYPES.has(q.type)) return `bad question type: ${n}`;
    if (typeof q.instructions !== 'string') return `bad instructions: ${n}`;
    if (q.type === 'choice' && (!q.criteria || typeof q.criteria !== 'object')) return `bad criteria: ${n}`;
    if (q.type === 'score' && (!Array.isArray(q.criteria) || q.criteria.length < 2)) return `bad criteria: ${n}`;
  }
  return null;
}

function corpusPath() {
  // Prefer project data/ next to app root in dev; beside resources when packaged
  const candidates = [
    path.join(__dirname, '..', 'data', 'odus.json'),
    path.join(process.resourcesPath || '', 'data', 'odus.json'),
    path.join(app.getAppPath(), 'data', 'odus.json'),
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return candidates[0];
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 680,
    backgroundColor: '#1a120c',
    title: 'Opwele — Ifá Opele',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL('http://127.0.0.1:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

ipcMain.handle('corpus:load', async () => {
  const p = corpusPath();
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return { ok: true, path: p, data: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, path: p, error: String(err && err.message ? err.message : err), data: [] };
  }
});

ipcMain.handle('ai:triangulate', async (_evt, payload) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return { ok: false, mode: 'local', error: 'NO_KEY' };
  }
  try {
    const body = {
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content:
            'You are a respectful assistant of Cuban Lucumí / Ifá tradition. You synthesize odù readings from corpus texts (often Spanish). Always respond in clear English. Do not invent dangerous rituals. Be structured and reverent.',
        },
        { role: 'user', content: payload.prompt },
      ],
    };
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, mode: 'openai', error: `HTTP ${res.status}: ${t.slice(0, 400)}` };
    }
    const json = await res.json();
    const text = json.choices?.[0]?.message?.content || '';
    return { ok: true, mode: 'openai', text };
  } catch (err) {
    return { ok: false, mode: 'openai', error: String(err && err.message ? err.message : err) };
  }
});

ipcMain.handle('jev:consult', async (_evt, req) => {
  if (!process.env.TYPESAFE_API_KEY) return { ok: false, error: 'NO_KEY' };
  const bad = validateJevRequest(req);
  if (bad) return { ok: false, error: `INVALID: ${bad}` };
  try {
    const res = await getJevClient().systemOne({
      state: req.state,
      questions: req.questions,
    });
    // Return plain JSON only (the SDK result may carry class instances).
    return {
      ok: true,
      model: res.model,
      answers: JSON.parse(JSON.stringify(res.answers)),
      usage: res.usage,
    };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

ipcMain.handle('ai:translate', async (_evt, payload) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return { ok: false, error: 'NO_KEY' };
  }
  const text = String(payload?.text || '').slice(0, 6000);
  if (!text.trim()) return { ok: true, text: '' };
  try {
    const body = {
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'Translate the user text from Spanish to natural English. Keep Ifá / Yoruba proper names (odù names, orisha names) unchanged. Output only the translation.',
        },
        { role: 'user', content: text },
      ],
    };
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${t.slice(0, 300)}` };
    }
    const json = await res.json();
    return { ok: true, text: json.choices?.[0]?.message?.content || '' };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
