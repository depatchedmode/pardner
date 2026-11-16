// A handoff to a reviewer is the common end of work in progress; every other
// status is kept so a handoff never silently starts or finishes work.
export const defaultHandoffStatus = status => status === 'in-progress' ? 'review' : status
