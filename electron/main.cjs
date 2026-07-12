const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;

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
            'Eres un asistente respetuoso de la tradición Ifá / Lucumí cubana. Sintetizas lecturas de odù a partir de textos del corpus (español). No inventes rituales peligrosos. Sé claro, estructurado y reverente. Responde en español.',
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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
