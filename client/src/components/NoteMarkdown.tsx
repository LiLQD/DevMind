import Markdown from "react-markdown";

export default function NoteMarkdown({ content }: { content: string }) {
  return <Markdown>{content}</Markdown>;
}
