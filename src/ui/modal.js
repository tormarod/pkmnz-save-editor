// Shared dialog mechanics for every overlay in the app: a .modal-overlay >
// .modal pair with a Tab focus trap, Escape-to-close, backdrop-click-to-close,
// and focus restored to whatever triggered the modal once it closes.

import { el } from './dom.js';
import { t } from '../i18n.js';

function focusable(overlay) {
  return [...overlay.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')]
    .filter((n) => !n.disabled && n.offsetParent !== null);
}

export function trapFocus(overlay, onEscape) {
  const handler = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onEscape(); return; }
    if (e.key !== 'Tab') return;
    const items = focusable(overlay);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  overlay.addEventListener('keydown', handler);
  return () => overlay.removeEventListener('keydown', handler);
}

/**
 * Open a modal overlay/box pair. The caller appends its own content to `box`
 * and calls `close(result)` when done; `onClose(result)` fires exactly once,
 * whether closed by a caller's button, the backdrop, or Escape (result
 * `undefined` for the latter two).
 */
export function openModal({ onClose }) {
  const previouslyFocused = document.activeElement;
  const overlay = el('div', 'modal-overlay');
  const box = el('div', 'modal');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  overlay.append(box);
  document.body.append(overlay);

  let closed = false;
  const close = (result) => {
    if (closed) return;
    closed = true;
    untrap();
    overlay.remove();
    if (previouslyFocused?.focus) previouslyFocused.focus();
    onClose(result);
  };
  const untrap = trapFocus(overlay, () => close(undefined));
  overlay.onclick = (e) => { if (e.target === overlay) close(undefined); };
  return { overlay, box, close };
}

/** A yes/no confirmation dialog: a themeable, accessible replacement for window.confirm(). */
export function confirmModal(message, { confirmLabel = t('common.continue'), cancelLabel = t('common.cancel'), danger = false } = {}) {
  return new Promise((resolve) => {
    const { box, close } = openModal({ onClose: (r) => resolve(r === true) });
    box.append(el('p', null, message));
    const actions = el('div', 'modal-actions');
    const cancel = el('button', 'ghost', cancelLabel);
    const go = el('button', danger ? 'danger' : 'primary', confirmLabel);
    actions.append(cancel, go);
    box.append(actions);
    cancel.onclick = () => close(false);
    go.onclick = () => close(true);
    go.focus();
  });
}
