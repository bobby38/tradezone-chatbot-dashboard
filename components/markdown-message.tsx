"use client";

import React from "react";
interface MarkdownMessageProps {
  content: string;
}

function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(!?\[[^\]]+\]\([^\)]+\)|\*\*[^*]+\*\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const segment = text.slice(lastIndex, match.index);
      if (segment) {
        nodes.push(<React.Fragment key={`text-${key++}`}>{segment}</React.Fragment>);
      }
    }

    const token = match[0];
    if (token.startsWith("![")) {
      const altMatch = token.match(/^!\[([^\]]*)\]\(([^\)]+)\)$/);
      if (altMatch) {
        const [, alt, url] = altMatch;
        nodes.push(
          <span key={`img-${key++}`} className="block my-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={alt || "Product image"}
              className="max-w-[250px] w-full rounded-md border border-border"
              style={{ height: "auto" }}
            />
          </span>,
        );
      }
    } else if (token.startsWith("[")) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^\)]+)\)$/);
      if (linkMatch) {
        const [, label, url] = linkMatch;
        nodes.push(
          <a
            key={`link-${key++}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            {label}
          </a>,
        );
      }
    } else if (token.startsWith("**")) {
      const bold = token.slice(2, -2);
      nodes.push(
        <strong key={`strong-${key++}`}>{bold}</strong>,
      );
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    const segment = text.slice(lastIndex);
    if (segment) {
      nodes.push(<React.Fragment key={`text-${key++}`}>{segment}</React.Fragment>);
    }
  }

  return nodes;
}

function renderMarkdown(content: string): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  const lines = content.split(/\n/);
  let currentList: { ordered: boolean; items: string[] } | null = null;
  let listKey = 0;

  const flushList = () => {
    if (!currentList) return;
    const items = currentList.items.map((item, idx) => (
      <li key={`li-${listKey}-${idx}`}>{parseInline(item)}</li>
    ));
    if (currentList.ordered) {
      elements.push(
        <ol key={`ol-${listKey++}`} className="list-decimal list-inside space-y-1">
          {items}
        </ol>,
      );
    } else {
      elements.push(
        <ul key={`ul-${listKey++}`} className="list-disc list-inside space-y-1">
          {items}
        </ul>,
      );
    }
    currentList = null;
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();

    if (!line) {
      flushList();
      return;
    }

    const orderedMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (orderedMatch) {
      const [, , item] = orderedMatch;
      if (!currentList || !currentList.ordered) {
        flushList();
        currentList = { ordered: true, items: [] };
      }
      currentList.items.push(item);
      if (index === lines.length - 1) {
        flushList();
      }
      return;
    }

    if (line.startsWith("- ")) {
      if (!currentList || currentList.ordered) {
        flushList();
        currentList = { ordered: false, items: [] };
      }
      currentList.items.push(line.slice(2));
      if (index === lines.length - 1) {
        flushList();
      }
      return;
    }

    flushList();

    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={`h3-${index}`} className="text-base font-semibold">
          {parseInline(line.slice(4))}
        </h3>,
      );
      return;
    }

    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={`h2-${index}`} className="text-lg font-semibold">
          {parseInline(line.slice(3))}
        </h2>,
      );
      return;
    }

    if (line.startsWith("# ")) {
      elements.push(
        <h1 key={`h1-${index}`} className="text-xl font-bold">
          {parseInline(line.slice(2))}
        </h1>,
      );
      return;
    }

    elements.push(
      <p key={`p-${index}`} className="mb-1 last:mb-0">
        {parseInline(rawLine)}
      </p>,
    );
  });

  flushList();

  return elements;
}

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  return <div className="space-y-2">{renderMarkdown(content)}</div>;
}
