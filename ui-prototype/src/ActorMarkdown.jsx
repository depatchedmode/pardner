import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useLayoutEffect, useRef, useState } from 'react'

function ScrollableMarkdown({ as: Element, label, children, ...props }) {
  const ref = useRef(null)
  const [overflow, setOverflow] = useState(false)
  useLayoutEffect(() => {
    const element = ref.current
    const measure = () => setOverflow(element.scrollWidth > element.clientWidth)
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    if (element.firstElementChild) observer.observe(element.firstElementChild)
    document.fonts.addEventListener('loadingdone', measure)
    measure()
    return () => {
      observer.disconnect()
      document.fonts.removeEventListener('loadingdone', measure)
    }
  }, [children])
  const scrollWithArrows = event => {
    if (!overflow || event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    event.currentTarget.scrollBy({ left: event.key === 'ArrowLeft' ? -40 : 40 })
  }
  return <Element {...props} ref={ref} tabIndex={overflow ? 0 : undefined}
    role={overflow ? 'region' : undefined} aria-label={overflow ? label : undefined} onKeyDown={scrollWithArrows}>
    {children}
  </Element>
}

const components = {
  img: ({ alt }) => <span>{alt || 'Image omitted'}</span>,
  p: ({ node, ...props }) => <p dir="auto" {...props} />,
  // A scroll wrapper keeps wide tables inside the panel without display:block,
  // which would drop table semantics in WebKit.
  table: ({ node, ...props }) => <ScrollableMarkdown as="div" className="md-table" label="Table">
    <table {...props} />
  </ScrollableMarkdown>,
  pre: ({ node, ...props }) => <ScrollableMarkdown as="pre" label="Code block" {...props} />,
}

export default function ActorMarkdown({ children, extraPlugins = [] }) {
  return (
    <Markdown remarkPlugins={[remarkGfm, ...extraPlugins]} components={components}>
      {children}
    </Markdown>
  )
}
