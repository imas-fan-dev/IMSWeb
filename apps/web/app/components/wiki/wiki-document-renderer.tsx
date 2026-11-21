import type { ReactNode } from "react"

import { NavigationLink } from "~/components/navigation/navigation-link"
import type {
  WikiDocumentBlock,
  WikiDocumentInline,
  WikiPublicStoryDocument,
} from "~/lib/api"
import { cn } from "~/lib/utils"

const CALLOUT_LABELS: Record<string, string> = {
  tip: "提示",
  info: "说明",
  warning: "注意",
  spoiler: "剧透",
}

const CALLOUT_TONES: Record<string, string> = {
  tip: "border-emerald-500/60 bg-emerald-500/5",
  info: "border-sky-500/60 bg-sky-500/5",
  warning: "border-amber-500/60 bg-amber-500/5",
  spoiler: "border-violet-500/60 bg-violet-500/5",
}

function inlineNodes(
  nodes: readonly WikiDocumentInline[],
  keyPrefix: string
): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`
    switch (node.type) {
      case "text":
        return node.value
      case "strong":
        return (
          <strong key={key} className="font-semibold">
            {inlineNodes(node.children, key)}
          </strong>
        )
      case "emphasis":
        return <em key={key}>{inlineNodes(node.children, key)}</em>
      case "delete":
        return <del key={key}>{inlineNodes(node.children, key)}</del>
      case "inlineCode":
        return (
          <code
            key={key}
            className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]"
          >
            {node.value}
          </code>
        )
      case "link": {
        // The API compiles and validates every URL into the AST contract
        // (`@imsweb/contracts/wiki`), so this only decides how to navigate.
        const external = !node.url.startsWith("/")
        return (
          <NavigationLink
            key={key}
            {...(external ? { href: node.url } : { to: node.url })}
            {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
            className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
          >
            {inlineNodes(node.children, key)}
          </NavigationLink>
        )
      }
      case "break":
        return <br key={key} />
      default:
        return null
    }
  })
}

function blockNodes(
  blocks: readonly WikiDocumentBlock[],
  keyPrefix: string
): ReactNode[] {
  return blocks.map((block, index) => {
    const key = `${keyPrefix}-${index}`
    switch (block.type) {
      case "heading": {
        const content = inlineNodes(block.children, key)
        const headingClass = cn(
          "scroll-mt-24 font-semibold text-balance",
          block.level === 2
            ? "mt-8 text-xl sm:text-2xl"
            : "mt-6 text-lg sm:text-xl"
        )
        return block.level === 2 ? (
          <h2 key={key} id={block.id} className={headingClass}>
            {content}
          </h2>
        ) : (
          <h3 key={key} id={block.id} className={headingClass}>
            {content}
          </h3>
        )
      }
      case "paragraph":
        return (
          <p key={key} className="mt-3 leading-7 text-pretty">
            {inlineNodes(block.children, key)}
          </p>
        )
      case "blockquote":
        return (
          <blockquote
            key={key}
            className="mt-3 border-l-4 border-border pl-4 text-muted-foreground"
          >
            {blockNodes(block.children, key)}
          </blockquote>
        )
      case "list": {
        const items = block.items.map((item, itemIndex) => (
          <li key={`${key}-${itemIndex}`} className="mt-1.5">
            {blockNodes(item.children, `${key}-${itemIndex}`)}
          </li>
        ))
        return block.ordered ? (
          <ol
            key={key}
            start={block.start ?? undefined}
            className="mt-3 list-decimal space-y-1 pl-6"
          >
            {items}
          </ol>
        ) : (
          <ul key={key} className="mt-3 list-disc space-y-1 pl-6">
            {items}
          </ul>
        )
      }
      case "table":
        return (
          <div key={key} className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {block.header.map((cell, cellIndex) => (
                    <th
                      key={`${key}-h-${cellIndex}`}
                      scope="col"
                      className={cn(
                        "border-b bg-muted/60 px-3 py-2 font-semibold",
                        alignClass(block.align[cellIndex])
                      )}
                    >
                      {inlineNodes(cell, `${key}-h-${cellIndex}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={`${key}-r-${rowIndex}`}>
                    {row.map((cell, cellIndex) => (
                      <td
                        key={`${key}-r-${rowIndex}-${cellIndex}`}
                        className={cn(
                          "border-b px-3 py-2 align-top",
                          alignClass(block.align[cellIndex])
                        )}
                      >
                        {inlineNodes(cell, `${key}-r-${rowIndex}-${cellIndex}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      case "thematicBreak":
        return <hr key={key} className="my-8 border-border" />
      case "callout":
        return (
          <aside
            key={key}
            role="note"
            data-callout={block.tone}
            className={cn(
              "mt-4 rounded-lg border-l-4 px-4 py-3",
              CALLOUT_TONES[block.tone] ?? CALLOUT_TONES.info
            )}
          >
            {block.title ? (
              <p className="text-sm font-semibold">
                {CALLOUT_LABELS[block.tone] ?? "说明"}：{block.title}
              </p>
            ) : null}
            {blockNodes(block.children, key)}
          </aside>
        )
      case "details":
        return (
          <details
            key={key}
            open={block.open}
            className="mt-4 rounded-lg border px-4 py-3"
          >
            <summary className="cursor-pointer text-sm font-semibold marker:text-muted-foreground">
              {block.title || "展开查看"}
            </summary>
            <div className="mt-2">{blockNodes(block.children, key)}</div>
          </details>
        )
      default:
        return null
    }
  })
}

function alignClass(align: "left" | "center" | "right" | null | undefined) {
  if (align === "center") return "text-center"
  if (align === "right") return "text-right"
  return "text-left"
}

/**
 * Renders the server-compiled Enhanced Markdown AST.
 *
 * Public Web and the Tauri App never parse Markdown and never inject HTML:
 * every node here is a typed React element built from the API contract.
 */
export function WikiDocumentRenderer({
  document,
  className,
}: {
  document: WikiPublicStoryDocument
  className?: string
}) {
  if (!document.blocks.length) return null
  return (
    <article
      data-testid="wiki-document"
      className={cn("max-w-none min-w-0", className)}
    >
      {blockNodes(document.blocks, "block")}
    </article>
  )
}
