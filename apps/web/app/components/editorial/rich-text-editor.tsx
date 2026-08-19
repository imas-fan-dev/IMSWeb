import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Image from "@tiptap/extension-image"
import { BoldIcon, Heading2Icon, Heading3Icon, ImagePlusIcon, ItalicIcon, LinkIcon, ListIcon, ListOrderedIcon, QuoteIcon, Redo2Icon, RemoveFormattingIcon, SparklesIcon, StrikethroughIcon, UnderlineIcon, Undo2Icon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "~/components/ui/button"

type Asset = { id: number; public_path: string; alt_text: string }

export function RichTextEditor({
  value,
  onChange,
  onUpload,
  variant = "default",
}: {
  value: Record<string, unknown>
  onChange: (value: Record<string, unknown>) => void
  onUpload: (file: File) => Promise<Asset>
  variant?: "default" | "article"
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false } }),
      Image.extend({
        addAttributes() {
          return { ...this.parent?.(), assetId: { default: null } }
        },
      }).configure({ allowBase64: false }),
    ],
    content: value,
    onUpdate: ({ editor: current }) => onChange(current.getJSON() as Record<string, unknown>),
  })

  useEffect(() => {
    if (!editor) return
    const current = JSON.stringify(editor.getJSON())
    if (current !== JSON.stringify(value)) editor.commands.setContent(value)
  }, [editor, value])

  async function insertImage(file: File | undefined) {
    if (!file || !editor) return
    setUploading(true)
    try {
      const asset = await onUpload(file)
      editor.chain().focus().insertContent({
        type: "image",
        attrs: { src: asset.public_path, alt: asset.alt_text, assetId: asset.id },
      } as never).run()
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  function setLink() {
    if (!editor) return
    const previous = editor.getAttributes("link").href as string | undefined
    const href = window.prompt("请输入站内路径或 HTTP(S) 链接", previous ?? "")
    if (href === null) return
    const value = href.trim()
    if (!value) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
      return
    }
    if (!/^(?:https?:\/\/|\/(?!\/))/i.test(value)) return
    editor.chain().focus().extendMarkRange("link").setLink({ href: value }).run()
  }

  const articleEditor = variant === "article"

  if (!editor) return <div className={articleEditor ? "min-h-96 rounded-2xl border border-primary/15 bg-card shadow-[0_18px_45px_rgb(37_129_199/0.08)]" : "min-h-48 rounded-lg border bg-muted/20"} />
  return (
    <div className={articleEditor ? "overflow-hidden rounded-2xl border border-primary/15 bg-card shadow-[0_18px_45px_rgb(37_129_199/0.08)] transition-shadow focus-within:border-primary/35 focus-within:shadow-[0_22px_55px_rgb(37_129_199/0.14)]" : "overflow-hidden rounded-lg border"}>
      {articleEditor ? <div className="flex h-1.5"><span className="flex-1 bg-franchise-765" /><span className="flex-1 bg-franchise-ml" /><span className="flex-1 bg-franchise-sidem" /><span className="flex-1 bg-franchise-sc" /></div> : null}
      {articleEditor ? <div className="flex items-center justify-between gap-3 border-b border-primary/10 bg-primary/4 px-4 py-3"><div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-full bg-primary/10 text-primary"><SparklesIcon className="size-3.5" /></span><div><p className="text-xs font-semibold tracking-[0.12em] text-primary">ARTICLE CANVAS</p><p className="mt-0.5 text-xs text-muted-foreground">正文编辑器</p></div></div><p className="hidden text-xs text-muted-foreground sm:block">使用工具栏排版，图片会保存到站内素材库</p></div> : null}
      <div className={articleEditor ? "flex flex-wrap items-center gap-1 border-b bg-muted/35 px-3 py-2.5" : "flex flex-wrap gap-1 border-b bg-muted/20 p-2"}>
        <div className="flex items-center gap-1"><Button type="button" size="icon-sm" variant={editor.isActive("bold") ? "secondary" : "ghost"} onClick={() => editor.chain().focus().toggleBold().run()} aria-label="粗体"><BoldIcon /></Button><Button type="button" size="icon-sm" variant={editor.isActive("italic") ? "secondary" : "ghost"} onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="斜体"><ItalicIcon /></Button><Button type="button" size="icon-sm" variant={editor.isActive("underline") ? "secondary" : "ghost"} onClick={() => editor.chain().focus().toggleUnderline().run()} aria-label="下划线"><UnderlineIcon /></Button><Button type="button" size="icon-sm" variant={editor.isActive("strike") ? "secondary" : "ghost"} onClick={() => editor.chain().focus().toggleStrike().run()} aria-label="删除线"><StrikethroughIcon /></Button></div>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <div className="flex items-center gap-1"><Button type="button" size="icon-sm" variant={editor.isActive("heading", { level: 2 }) ? "secondary" : "ghost"} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} aria-label="二级标题"><Heading2Icon /></Button><Button type="button" size="icon-sm" variant={editor.isActive("heading", { level: 3 }) ? "secondary" : "ghost"} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} aria-label="三级标题"><Heading3Icon /></Button><Button type="button" size="icon-sm" variant={editor.isActive("bulletList") ? "secondary" : "ghost"} onClick={() => editor.chain().focus().toggleBulletList().run()} aria-label="无序列表"><ListIcon /></Button><Button type="button" size="icon-sm" variant={editor.isActive("orderedList") ? "secondary" : "ghost"} onClick={() => editor.chain().focus().toggleOrderedList().run()} aria-label="有序列表"><ListOrderedIcon /></Button><Button type="button" size="icon-sm" variant={editor.isActive("blockquote") ? "secondary" : "ghost"} onClick={() => editor.chain().focus().toggleBlockquote().run()} aria-label="引用"><QuoteIcon /></Button></div>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <div className="flex items-center gap-1"><Button type="button" size="icon-sm" variant="ghost" onClick={() => editor.chain().focus().setHorizontalRule().run()} aria-label="分隔线"><RemoveFormattingIcon /></Button><Button type="button" size="icon-sm" variant={editor.isActive("link") ? "secondary" : "ghost"} onClick={setLink} aria-label="链接"><LinkIcon /></Button><Button type="button" size="icon-sm" variant="ghost" onClick={() => editor.chain().focus().undo().run()} aria-label="撤销"><Undo2Icon /></Button><Button type="button" size="icon-sm" variant="ghost" onClick={() => editor.chain().focus().redo().run()} aria-label="重做"><Redo2Icon /></Button></div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => void insertImage(event.target.files?.[0])} />
        <Button type="button" size="sm" variant="outline" className={articleEditor ? "ml-auto border-primary/20 bg-background/80 hover:bg-primary/8" : undefined} disabled={uploading} onClick={() => fileRef.current?.click()}><ImagePlusIcon data-icon="inline-start" />{uploading ? "上传中" : "插入图片"}</Button>
      </div>
      <EditorContent editor={editor} className={articleEditor ? "prose prose-neutral min-h-96 max-w-none bg-[radial-gradient(circle_at_top_right,color-mix(in_oklch,var(--franchise-sc)_10%,transparent),transparent_32%),linear-gradient(180deg,color-mix(in_oklch,var(--primary)_3%,transparent),transparent_15rem)] p-6 text-[1rem]/8 focus-within:outline-none sm:p-8 dark:prose-invert [&_.ProseMirror]:min-h-80 [&_.ProseMirror]:outline-none [&_.ProseMirror_h2]:mt-10 [&_.ProseMirror_h2]:border-l-3 [&_.ProseMirror_h2]:border-primary [&_.ProseMirror_h2]:pl-3 [&_.ProseMirror_h3]:mt-8 [&_.ProseMirror_img]:rounded-xl [&_.ProseMirror_img]:border [&_.ProseMirror_img]:shadow-sm [&_.ProseMirror_blockquote]:border-primary/50 [&_.ProseMirror_blockquote]:bg-primary/5 [&_.ProseMirror_blockquote]:py-1 [&_.ProseMirror_blockquote]:pr-4" : "prose prose-neutral dark:prose-invert min-h-64 max-w-none p-4 focus-within:outline-none"} />
    </div>
  )
}
