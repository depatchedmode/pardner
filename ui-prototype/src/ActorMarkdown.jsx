import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const components = {
  img: ({ alt }) => <span>{alt || 'Image omitted'}</span>,
  // A scroll wrapper keeps wide tables inside the panel without display:block,
  // which would drop table semantics in WebKit.
  table: ({ node, ...props }) => <div className="md-table"><table {...props} /></div>,
}

export default function ActorMarkdown({ children }) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </Markdown>
  )
}
