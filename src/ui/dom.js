// Tiny DOM-construction helpers shared by every tab module.

export const $ = (s) => document.querySelector(s);

export const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt !== undefined) n.textContent = txt;
  return n;
};
