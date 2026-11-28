/** Opaque unique id. crypto.randomUUID needs a secure context (https / localhost), so fall back on plain http. */
export const uid = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
