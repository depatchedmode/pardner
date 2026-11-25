/** Domain vocab shared by Node services and the browser UI (no Node APIs). */

// Schema 9: every change carries a machine-prefixed actor and is signed in the project's signature document.
// Schema 10: the signature cache also keeps equivocation reports.
// Schema 11: the signature cache also keeps the signatures that prove each equivocation report.
// Schema 12: machine and person identities use did:key.
// Schema 13: tasks, veins and goals share outcomes, and task threads carry assigned to-dos.
export const SCHEMA_VERSION = 13
export const TASK_FIELDS = ['title', 'description', 'outcome', 'priority', 'assignee', 'tags', 'order', 'type']
export const GOAL_FIELDS = ['title', 'description', 'outcome']
export const VEIN_FIELDS = ['title', 'description', 'outcome', 'goalId']
export const OUTCOMES = ['completed', 'dead-end', 'abandoned']
export const WORK_STATES = ['open', 'ended']
export const STATE_LABELS = {
  open: 'Open',
  ended: 'Ended',
  completed: 'Completed',
  'dead-end': 'Dead end',
  abandoned: 'Abandoned',
}

/** Execution states that still accept cancel from the control UI. */
export const CANCELLABLE_EXECUTION_STATES = ['queued', 'running', 'blocked', 'cancel_requested']
