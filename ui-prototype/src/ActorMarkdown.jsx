import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const components = {
  img: ({ alt }) => <span>{alt || 'Image omitted'}</span>,
}

export default function ActorMarkdown({ children }) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </Markdown>
  )
}
