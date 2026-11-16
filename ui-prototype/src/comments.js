// Which unread revisions of a comment are new to this reader: unread, and not
// written by the reader. Authorship is per revision when alternatives exist.
export function newRevisionIds(comment, actorId) {
  if (!actorId) return []
  const authors = new Map((comment.conflicts ?? []).map(choice => [choice.operationId, choice.actorId]))
  return (comment.unreadRevisionIds ?? []).filter(id => (authors.get(id) ?? comment.editedBy ?? comment.actorId) !== actorId)
}

export const isNewComment = (comment, actorId) => newRevisionIds(comment, actorId).length > 0
