import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { useState } from "react";
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

function CopyCodeButton({ text }: { text: string }) {
  const [feedback, setFeedback] = useState("");
  const [isCopying, setIsCopying] = useState(false);

  const copyCode = async () => {
    if (isCopying) return;
    setIsCopying(true);
    setFeedback("");
    try {
      await navigator.clipboard.writeText(text);
      setFeedback("Copied");
    } catch {
      setFeedback("Could not copy. Select the code to copy it.");
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <div className="code-block-toolbar">
      <span role="status">{feedback}</span>
      <button
        type="button"
        className="secondary-btn code-copy-button"
        onClick={() => void copyCode()}
        aria-disabled={isCopying}
      >
        Copy code
      </button>
    </div>
  );
}

const components: Components = {
  pre({ node, children, ...props }) {
    const code = node?.children[0];
    const source =
      code?.type === "element" && code.tagName === "code"
        ? code.children[0]
        : undefined;
    if (source?.type !== "text") return <pre {...props}>{children}</pre>;

    return (
      <div className="markdown-code-block">
        <CopyCodeButton key={source.value} text={source.value} />
        <pre {...props}>{children}</pre>
      </div>
    );
  },
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
