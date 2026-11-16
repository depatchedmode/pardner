/** Domain vocab shared by Node services and the browser UI (no Node APIs). */

// Schema 9: every change carries a machine-prefixed actor and is signed in the project's signature document.
// Schema 10: the signature cache also keeps equivocation reports.
// Schema 11: the signature cache also keeps the signatures that prove each equivocation report.
export const SCHEMA_VERSION = 11
export const TASK_FIELDS = ['title', 'description', 'status', 'priority', 'assignee', 'tags', 'order', 'type']
export const STATUSES = ['backlog', 'up-next', 'in-progress', 'review', 'completed', 'dead-end', 'abandoned']
export const CLOSED_TASK_STATUSES = ['completed', 'dead-end', 'abandoned']
export const GOAL_FIELDS = ['title', 'description', 'status']
export const GOAL_STATUSES = ['open', 'achieved', 'abandoned']
export const VEIN_FIELDS = ['title', 'description', 'status', 'goalId']
export const VEIN_STATUSES = ['open', 'proven', 'dead-end', 'abandoned']

export const STATUS_LABELS = {
  backlog: 'Backlog',
  'up-next': 'Up next',
  'in-progress': 'In progress',
  review: 'Review',
  completed: 'Completed',
  'dead-end': 'Dead end',
  abandoned: 'Abandoned',
  open: 'Open',
  proven: 'Proven',
  achieved: 'Achieved',
}

/** Execution states that still accept cancel from the control UI. */
export const CANCELLABLE_EXECUTION_STATES = ['queued', 'running', 'blocked', 'cancel_requested']
