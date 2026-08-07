// Tiny DOM-construction helpers shared by every tab module.

export const $ = (s) => document.querySelector(s);

export const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt !== undefined) n.textContent = txt;
  return n;
};

/**
 * The one control every boolean in the app uses: a hidden checkbox plus an
 * On/Off pill the stylesheet paints from its :checked state. Clicking the
 * label toggles the checkbox natively, so callers only need its `change`
 * event and `.checked` — exactly as with a bare checkbox.
 *
 * Static checkboxes in index.html get the same treatment by putting a
 * <span class="switchbtn"></span> right after the <input>.
 */
export function boolToggle(checked, text) {
  const label = el('label', 'check');
  const input = el('input');
  input.type = 'checkbox';
  input.checked = checked === true;
  label.append(input, el('span', 'switchbtn'));
  if (text) label.append(document.createTextNode(` ${text}`));
  return { label, input };
}
