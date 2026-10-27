export {};

export interface OpweleAPI {
  loadCorpus: () => Promise<{
    ok: boolean;
    path: string;
    data: unknown;
    error?: string;
  }>;
  triangulateOpenAI: (payload: { prompt: string }) => Promise<{
    ok: boolean;
    mode: string;
    text?: string;
    error?: string;
  }>;
  translateOpenAI: (payload: { text: string }) => Promise<{
    ok: boolean;
    text?: string;
    error?: string;
  }>;
  jevConsult: (req: import('./lib/jev').JevRequest) => Promise<
    import('./lib/jev').JevResponse
  >;
}

declare global {
  interface Window {
    opwele?: OpweleAPI;
  }
}
