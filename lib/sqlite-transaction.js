/**
 * Runs `work` in one immediate SQLite transaction. A nested call joins the open
 * transaction, so helpers that write can be composed inside a larger change.
 */
export function transaction(database, work) {
  if (database.isTransaction) return work()
  database.exec('BEGIN IMMEDIATE')
  try {
    const result = work()
    database.exec('COMMIT')
    return result
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}
