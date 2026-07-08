export const VENUES = [
  { id: 'venue_01', name: 'MetLife Stadium' },
  { id: 'venue_02', name: 'AT&T Stadium' },
  { id: 'venue_03', name: 'Estadio Azteca' }
];

export const LANGUAGES = [
  { code: 'en-US', label: 'English', dir: 'ltr' },
  { code: 'es-ES', label: 'Español', dir: 'ltr' },
  { code: 'pt-BR', label: 'Português', dir: 'ltr' },
  { code: 'fr-FR', label: 'Français', dir: 'ltr' },
  { code: 'de-DE', label: 'Deutsch', dir: 'ltr' },
  { code: 'it-IT', label: 'Italiano', dir: 'ltr' },
  { code: 'ar-SA', label: 'العربية', dir: 'rtl' },
  { code: 'ja-JP', label: '日本語', dir: 'ltr' }
];

// Arabic is written right-to-left; every other currently-supported language is left-to-right.
// Looked up by code (not hardcoded per-component) so any future RTL language addition only
// needs a `dir` entry here, not a scattered set of "is this Arabic" checks.
export function getLanguageDir(code) {
  const match = LANGUAGES.find((lang) => lang.code === code);
  return match ? match.dir : 'ltr';
}
