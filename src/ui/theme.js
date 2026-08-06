// Dark/light theme toggle, backed by localStorage and prefers-color-scheme.

import { $ } from './dom.js';

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = $('#themeToggle');
  if (btn) btn.textContent = theme === 'light' ? '☀️' : '🌙';
}

export function initTheme() {
  const stored = localStorage.getItem('pkmnz-theme');
  const theme = stored || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  applyTheme(theme);

  $('#themeToggle').onclick = () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('pkmnz-theme', next);
    applyTheme(next);
  };
}
