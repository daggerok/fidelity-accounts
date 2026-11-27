/// <reference lib="esnext" />
// Which sections of ⚙️ Settings are folded: the owner's own choice is kept in this browser (owner 2026-11-27: "saving
// state doesnt work ... I constantly see that getting started menu is expanded even if I collapsed it"), and a section
// nobody touched follows its default
export const SECTIONS_KEY = 'fidelity-accounts-settings-sections';
export type SectionChoices = Record<string, boolean>;

type Reads = Pick<Storage, 'getItem'>;
type Writes = Pick<Storage, 'setItem'>;

export function readSections(storage: Reads | undefined): SectionChoices {
  try {
    const json: unknown = JSON.parse(storage?.getItem(SECTIONS_KEY) ?? '{}');
    const out: SectionChoices = {};
    if (json && typeof json === 'object') Object.entries(json as Record<string, unknown>).forEach(([k, v]) => { if (typeof v === 'boolean') out[k] = v; });
    return out;
  } catch { return {}; }
}

/** the section as the owner left it, else its default */
export const sectionOpen = (choices: SectionChoices, id: string, fallback: boolean): boolean => (id in choices ? choices[id] : fallback);

export function saveSection(storage: (Reads & Writes) | undefined, id: string, open: boolean): SectionChoices {
  const next = { ...readSections(storage), [id]: open };
  try { storage?.setItem(SECTIONS_KEY, JSON.stringify(next)); } catch { /* private window: this visit only */ }
  return next;
}
