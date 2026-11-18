import { useLayoutEffect, useRef, useState } from 'react'
import { Failure } from './Failure.jsx'

function useActionError(action) {
  const [error, setError] = useState(null)
  const noticeRef = useRef(null)
  const triggerRef = useRef(null)

  useLayoutEffect(() => {
    if (!error) return
    const trigger = triggerRef.current?.getBoundingClientRect()
    // Reveal feedback at the viewport edge without pulling someone back after they scroll away.
    if (trigger && trigger.bottom > 0 && trigger.top < window.innerHeight) {
      noticeRef.current.scrollIntoView({ block: 'nearest' })
    }
  }, [error])

  async function run(event) {
    event.preventDefault()
    triggerRef.current = event.nativeEvent.submitter ?? event.currentTarget
    setError(null)
    try { await action(event) } catch (failure) { setError(failure) }
  }

  const notice = error && <div ref={noticeRef}>
    <Failure error={error}>
      <button type="button" onClick={() => setError(null)}>Dismiss</button>
    </Failure>
  </div>
  return { run, notice }
}

export function ActionForm({ onSubmit, children }) {
  const { run, notice } = useActionError(onSubmit)
  return <form onSubmit={run}>{children}{notice}</form>
}

export function ActionButton({ onClick, ...props }) {
  const { run, notice } = useActionError(onClick)
  return <div><button {...props} onClick={run} />{notice}</div>
}
