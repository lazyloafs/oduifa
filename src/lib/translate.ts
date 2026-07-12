/**
 * Spanish → English translation for divination output.
 * Prefers OpenAI (Electron) when OPENAI_API_KEY is set; else MyMemory free API.
 */

const memory = new Map<string, string>();

function cacheKey(text: string): string {
  return text.trim().slice(0, 800);
}

/** Heuristic: already mostly English? */
export function looksEnglish(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  const esHits =
    (t.match(
      /\b(que|los|las|una|con|por|para|está|esta|usted|tiene|debe|cuidado|cuando|sobre|también|hacia|después)\b/gi
    ) || []).length;
  const enHits =
    (t.match(
      /\b(the|and|you|your|with|that|this|from|have|should|care|when|about|also|after|will)\b/gi
    ) || []).length;
  return enHits >= esHits && esHits < 3;
}

async function viaOpenAI(text: string): Promise<string | null> {
  if (!window.opwele?.translateOpenAI) return null;
  try {
    const res = await window.opwele.translateOpenAI({ text });
    if (res.ok && res.text) return res.text.trim();
  } catch {
    /* fall through */
  }
  return null;
}

async function viaMyMemory(text: string): Promise<string | null> {
  const q = text.slice(0, 450);
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=es|en`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      responseData?: { translatedText?: string };
    };
    const out = json.responseData?.translatedText?.trim();
    if (!out || /MYMEMORY WARNING/i.test(out)) return null;
    return out;
  } catch {
    return null;
  }
}

async function translateChunk(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (looksEnglish(trimmed)) return trimmed;

  const key = cacheKey(trimmed);
  if (memory.has(key)) return memory.get(key)!;

  const openai = await viaOpenAI(trimmed);
  if (openai) {
    memory.set(key, openai);
    return openai;
  }

  // Split long text for free API
  if (trimmed.length <= 450) {
    const mm = await viaMyMemory(trimmed);
    const out = mm || trimmed;
    memory.set(key, out);
    return out;
  }

  const parts: string[] = [];
  let rest = trimmed;
  while (rest.length > 0) {
    let slice = rest.slice(0, 420);
    const lastStop = Math.max(
      slice.lastIndexOf('. '),
      slice.lastIndexOf('! '),
      slice.lastIndexOf('? '),
      slice.lastIndexOf('\n')
    );
    if (lastStop > 120) slice = rest.slice(0, lastStop + 1);
    parts.push(slice.trim());
    rest = rest.slice(slice.length).trim();
  }

  const translated: string[] = [];
  for (const p of parts) {
    const mm = await viaMyMemory(p);
    translated.push(mm || p);
    await new Promise((r) => setTimeout(r, 120));
  }
  const joined = translated.join(' ').trim();
  memory.set(key, joined);
  return joined;
}

/** Translate Spanish (or mixed) text to English. */
export async function translateToEnglish(text: string): Promise<string> {
  return translateChunk(text);
}

/** Translate many strings; preserves empty; dedupes identical inputs. */
export async function translateMany(texts: string[]): Promise<string[]> {
  const unique = [...new Set(texts.filter((t) => t && t.trim()))];
  const map = new Map<string, string>();
  for (const u of unique) {
    map.set(u, await translateToEnglish(u));
  }
  return texts.map((t) => (t && t.trim() ? map.get(t) || t : t));
}
