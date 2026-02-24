import db from '../db/db.js';

const insertActivityStmt = db.prepare(`
  INSERT INTO activity_feed
    (family_id, subject_user_id, actor_user_id, event_type, description, reference_id, reference_type, amount_cents)
  VALUES
    (@familyId, @subjectUserId, @actorUserId, @eventType, @description, @referenceId, @referenceType, @amountCents)
`);

export function insertActivity({
  familyId,
  subjectUserId,
  actorUserId,
  eventType,
  description,
  referenceId = null,
  referenceType = null,
  amountCents = null,
}) {
  return insertActivityStmt.run({
    familyId,
    subjectUserId,
    actorUserId,
    eventType,
    description,
    referenceId,
    referenceType,
    amountCents,
  });
}
