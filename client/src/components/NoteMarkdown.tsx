import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import Markdown from "react-markdown";
import type { Components } from "react-markdown";
import bash from "refractor/bash";
import { refractor } from "refractor/core";
import javascript from "refractor/javascript";
import json from "refractor/json";
import typescript from "refractor/typescript";
import yaml from "refractor/yaml";

for (const syntax of [bash, javascript, json, typescript, yaml]) {
  refractor.register(syntax);
}

const components: Components = {
  code({ node: _node, className, children, ...props }) {
    const language = /(?:^|\s)language-(\S+)/
      .exec(className ?? "")?.[1]
      ?.toLowerCase();
    let rendered = children;

    // Keep large blocks readable without running a synchronous tokenizer on them.
    if (
      language &&
      typeof children === "string" &&
      children.length <= 20_000 &&
      refractor.registered(language)
    ) {
      try {
        rendered = toJsxRuntime(refractor.highlight(children, language), {
          Fragment,
          jsx,
          jsxs,
        });
      } catch {
        // A tokenizer failure still leaves the original code readable.
      }
    }

    return (
      <code className={className} {...props}>
        {rendered}
      </code>
    );
  },
};

export default function NoteMarkdown({ content }: { content: string }) {
  return <Markdown components={components}>{content}</Markdown>;
}
