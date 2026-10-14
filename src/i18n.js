import { english } from './locales/en.js';
import { messagePatterns } from './locales/patterns.js';

export const LOCALE_KEY = 'zhongxi-isle-language-v1';
export const SUPPORTED_LOCALES = ['en', 'zh-CN'];
export function detectLocale(languages = []) {
  const first = languages.find(value => typeof value === 'string' && /^(?:en|zh)(?:-|$)/i.test(value.trim()));
  return /^zh(?:-|$)/i.test(first || '') ? 'zh-CN' : 'en';
}
export function readLocale(storage, languages) {
  try { const saved = storage?.getItem(LOCALE_KEY); if (SUPPORTED_LOCALES.includes(saved)) return saved; } catch {}
  return detectLocale(languages);
}
function browserStorage() { try { return globalThis.localStorage; } catch { return undefined; } }
let locale = readLocale(browserStorage(), globalThis.navigator?.languages?.length ? globalThis.navigator.languages : [globalThis.navigator?.language]);
const listeners = new Set();
export const getLocale = () => locale;
export const onLocaleChange = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export function setLocale(value, storage = browserStorage()) {
  if (!SUPPORTED_LOCALES.includes(value)) return false;
  try { storage?.setItem(LOCALE_KEY, value); } catch {}
  if (value === locale) return true;
  locale = value; updateDocumentLanguage();
  for (const listener of listeners) listener(value);
  return true;
}
export function t(key, values = {}) {
  const message = locale === 'en' ? english[key] ?? key : key;
  return message.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
}
const escapeRE = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = messagePatterns.map(key => {
  const names = [...key.matchAll(/\{(p\d+)\}/g)].map(m => m[1]);
  const pieces = key.split(/\{p\d+\}/g);
  return { key, names, re: new RegExp('^' + pieces.map(escapeRE).join('(.+?)') + '$') };
}).sort((a,b)=>b.key.replace(/\{p\d+\}/g,'').length-a.key.replace(/\{p\d+\}/g,'').length);
const phrases = Object.keys(english).filter(key => !key.includes('{') && /\p{Script=Han}/u.test(key)).sort((a,b)=>b.length-a.length);
// Core names, reasons and persisted journal entries are translated only when presented.
// Markup is never searched or rewritten: templates localize their own text and attributes.
export function tr(value) {
  if (typeof value !== 'string' || locale !== 'en' || !/\p{Script=Han}/u.test(value) || value.includes('<')) return value;
  if (Object.hasOwn(english, value)) return t(value);
  for (const pattern of patterns) {
    const match = value.match(pattern.re);
    if (match) return t(pattern.key, Object.fromEntries(pattern.names.map((name,i)=>[name,tr(match[i+1])])));
  }
  // Older saves contain concatenated messages. Match dictionary phrases at the text boundary.
  let text=value;
  for(const phrase of phrases) if(text.includes(phrase)) text=text.split(phrase).join(english[phrase]);
  return text;
}
export function refreshLocalizedLabels(root = document) {
  for (const el of root.querySelectorAll('[data-l10n]')) el.textContent=t(decodeKey(el.dataset.l10n));
  for (const attr of ['aria-label','title']) for(const el of root.querySelectorAll('[data-l10n-'+attr+']')) el.setAttribute(attr,t(decodeKey(el.getAttribute('data-l10n-'+attr))));
}
const decodeKey = value => new TextDecoder().decode(Uint8Array.from(atob(value),c=>c.charCodeAt(0)));
export function updateDocumentLanguage() { if (globalThis.document) document.documentElement.lang=locale; }
updateDocumentLanguage();

// Dialog renderers rebuild their bodies; keep native language-control keyboard focus.
export function preserveLanguageFocus(root, render, active = globalThis.document?.activeElement) {
  const focused = !!active && root.contains(active) && active.matches('[data-language-select]');
  const result = render();
  if (focused) root.querySelector('[data-language-select]')?.focus();
  return result;
}
