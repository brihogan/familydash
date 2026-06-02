import { useId } from 'react';

const BULLET = '•'; // •

/**
 * A password-style input that is NOT a real password field.
 *
 * iOS in-app browsers (e.g. "HappyWeb: Family Browser") crash their WebView
 * when the system password AutoFill UI is presented. iOS classifies a field as
 * "secure" — and presents that crashing UI — based on type="password",
 * -webkit-text-security, and password-ish name/autocomplete hints. Stripping
 * just one of those wasn't enough, so this component avoids all of them: it is
 * a plain type="text" field with a neutral name and autoComplete="off", and we
 * mask the displayed characters as bullets in JS while keeping the real value
 * in the parent's state.
 *
 * Editing model: append + delete-at-end (normal password typing). Mid-string
 * edits are ignored, which is acceptable for credential entry. onChange is
 * called with the real (unmasked) string.
 */
export default function MaskedInput({ value, onChange, numeric = false, ...props }) {
  const autoId = useId();
  const masked = BULLET.repeat(value.length);

  const handleChange = (e) => {
    const shown = e.target.value;
    let next;
    if (shown.length >= value.length) {
      // Newly typed/pasted chars land after the existing bullets; real chars
      // are never bullets, so strip any stray bullets from a mid-string caret.
      const added = shown.slice(value.length).split(BULLET).join('');
      next = value + added;
    } else {
      // Characters were deleted from the end.
      next = value.slice(0, shown.length);
    }
    if (numeric) next = next.replace(/\D/g, '');
    onChange(next);
  };

  return (
    <input
      {...props}
      type="text"
      name={props.name || `f-${autoId}`}
      autoComplete="off"
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      inputMode={numeric ? 'numeric' : props.inputMode}
      value={masked}
      onChange={handleChange}
    />
  );
}
