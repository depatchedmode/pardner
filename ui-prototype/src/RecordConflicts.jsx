import { FIELD_LABELS, conflictGroups } from './record-conflicts.js'

// The closed-by-default disclosure for a goal or vein with competing edits.
// Every distinct value gets one Keep button; nothing is dropped until one is chosen.
export default function RecordConflicts({ kind, record, actors, goals, labels, labelActor, submit, disabled, onDone }) {
  const fields = Object.keys(record.conflicts)
  const valueText = (field, value) => field === 'status' ? (labels[value] ?? String(value))
    : field === 'goalId' ? (goals[value]?.title ?? 'Unknown goal') : String(value ?? '')
  const keep = async (event, field, group) => {
    const button = event.currentTarget
    const receipt = await submit(`${kind}.resolve`, {
      [`${kind}Id`]: record.id, field, value: group.value, expectedRevisions: record.revisions[field],
    })
    // Success moves focus to the record's status control; a failure returns it to this button.
    onDone(receipt ? { kind, record, field, value: group.value } : { element: button })
  }
  return (
    <details className="record-conflict" data-record-conflict={record.id}>
      <summary>Conflicting edits: {fields.map(field => FIELD_LABELS[field] ?? field).join(', ')}</summary>
      {fields.map(field => {
        const label = FIELD_LABELS[field] ?? field
        return (
          <div className="record-conflict-field" key={field}>
            <p>{label[0].toUpperCase() + label.slice(1)}: both edits are kept until you choose one.</p>
            {conflictGroups(record.conflicts[field]).map(group => {
              const authors = group.actorIds.map(id => labelActor(actors[id])).join(' and ')
              const value = valueText(field, group.value)
              const visible = field === 'status' || field === 'goalId' ? `Keep ${value}` : `Keep ${authors}'s ${label}`
              return (
                <div className="record-choice" key={group.operationIds[0]}>
                  <strong>{authors}</strong>
                  <span className="record-choice-value" data-field={field}>{value}</span>
                  <button
                    type="button"
                    aria-label={`${visible} for ${kind} ${record.title}`}
                    disabled={disabled}
                    onClick={event => keep(event, field, group)}
                  >
                    {visible}
                  </button>
                </div>
              )
            })}
          </div>
        )
      })}
    </details>
  )
}
