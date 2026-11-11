// A refusal from the local client, with advice a person can act on for the codes that need it.

export const HINTS = {
  INVITE_EXPIRED: 'Ask for a new invitation; this one has expired.',
  REVOKED: 'This invitation was revoked, or this computer was removed from the project. A removed computer can join again only from a fresh client directory.',
  INVITE_USED: 'This invitation was already used by someone else. Ask for a new one.',
  INVALID_INVITATION: 'Check that you pasted the whole invitation, exactly as it was sent.',
  IDENTITY_MISMATCH: 'A My device invitation links a computer that has no identity yet, or already has this person’s. To link this computer as someone else, start Pardner with a fresh client directory. To join as yourself, use a Human invitation.',
  JOIN_REJECTED: 'Nobody was admitted. Ask for a new invitation if you still need to join.',
  REQUEST_EXPIRED: 'Approval didn’t come in time. Ask for a new invitation.',
  MACHINE_REMOVED: 'Start Pardner with a fresh client directory on this computer, then join from there.',
  PERSON_REMOVED: 'Start Pardner with a fresh client directory, then join with a new Human invitation as a new person.',
  ALREADY_MEMBER: 'Open the project from the project switcher instead.',
  TOO_MANY_REQUESTS: 'Ask the person who invited you to clear the waiting requests, or for a new invitation.',
  DEVICE_INVITATION_REQUIRED: 'Linking this device needs a My device invitation from your own client. Human and Agent invitations work after you confirm your identity.',
  HUB_UNAVAILABLE: 'The project’s hub is unreachable, so this can’t finish yet. Retry when it is back; nothing was lost.',
  HUB_REQUIRED: 'This computer can’t create invitations for this project yet. Ask the person who started the project, or retry later.',
  CLIENT_UNREACHABLE: 'Your local Pardner client may have stopped. Ask your agent to reopen it, then retry.',
  STALE_UPDATE: 'Someone changed this at the same time. Close this and try again.',
}

// A human heading replaces the server's message for these codes. Without a hint, the server's message,
// which names the address and the fix, becomes the explanation (#162).
const HEADINGS = {
  HUB_UNAVAILABLE: 'The project’s hub is unreachable',
  PUBLIC_URL_REQUIRED: 'This invitation would only work on this computer',
  INVITATION_UNREACHABLE: 'This invitation points somewhere this computer can’t reach',
}
// Invitations for a joined project are issued by its hub, so an outage there blocks them.
export const INVITE_HINTS = {
  HUB_UNAVAILABLE: 'Invitations for this project are issued by its hub, the computer of the person who started it, and it can’t be reached right now. Retry when it’s back; nothing was lost.',
}

export function failureText(error, hints = HINTS) {
  const heading = HEADINGS[error.code]
  return { heading: heading ?? error.message, hint: hints[error.code] ?? HINTS[error.code] ?? (heading ? error.message : null) }
}

// Server messages quote commands in backticks, such as `pardner client serve --public-url <https origin>`.
export const withCode = text => text.split('`').map((part, index) => index % 2 ? <code key={index}>{part}</code> : part)

export function Failure({ error, children, hints = HINTS }) {
  if (!error) return null
  const { heading, hint } = failureText(error, hints)
  return <div className="error inline-error" role="alert">
    <strong>{heading}</strong>
    {hint && <p>{withCode(hint)}</p>}
    {children}
  </div>
}
