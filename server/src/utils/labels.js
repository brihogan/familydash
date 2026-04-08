import db from '../db/db.js';

/**
 * Returns the per-family display label for "Chores" in several useful forms.
 * Used when composing activity feed descriptions that users will see.
 */
export function getChoresLabels(familyId) {
  const family = db.prepare('SELECT chores_label FROM families WHERE id = ?').get(familyId);
  const plural = (family?.chores_label || 'Chores').trim() || 'Chores';
  const singular = plural.endsWith('s') ? plural.slice(0, -1) : plural;
  return {
    plural,
    singular,
    pluralLower: plural.toLowerCase(),
    singularLower: singular.toLowerCase(),
  };
}
