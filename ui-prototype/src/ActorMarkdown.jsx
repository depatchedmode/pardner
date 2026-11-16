import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const components = {
  img: ({ alt }) => <span>{alt || 'Image omitted'}</span>,
  // A scroll wrapper keeps wide tables inside the panel without display:block,
  // which would drop table semantics in WebKit.
  table: ({ node, ...props }) => <div className="md-table"><table {...props} /></div>,
}

export default function ActorMarkdown({ children, extraPlugins = [] }) {
  return (
    <Markdown remarkPlugins={[remarkGfm, ...extraPlugins]} components={components}>
      {children}
    </Markdown>
  )
}
