import { useCallback, useEffect, useMemo, useState } from "react"

import {
  getAdminWikiEntryDocument,
  previewAdminWikiEntryDocument,
} from "~/lib/api"
import type {
  WikiAdminEntryDocument,
  WikiContentMode,
  WikiDocumentWarning,
  WikiPublicStoryDocument,
} from "~/lib/api"
import { revisionsSummaryAfterSave } from "./wiki-document-model"

/** Request state for one entry's stored document (read side of the workbench). */
type EntryDocumentRequest = {
  key: string
  data: WikiAdminEntryDocument | null
  error: unknown
}

export function useWikiEntryDocument(entryId: number) {
  const [version, setVersion] = useState(0)
  const key = `${entryId}\u0000${version}`
  const [request, setRequest] = useState<EntryDocumentRequest>({
    key: "",
    data: null,
    error: null,
  })

  useEffect(() => {
    let active = true
    void getAdminWikiEntryDocument(entryId)
      .send()
      .then((result) => {
        if (active) setRequest({ key, data: result, error: null })
      })
      .catch((error: unknown) => {
        if (active) setRequest({ key, data: null, error })
      })
    return () => {
      active = false
    }
  }, [entryId, key])

  const requestIsCurrent = request.key === key
  const data = requestIsCurrent ? request.data : null
  const error = requestIsCurrent ? request.error : null
  const loading = !requestIsCurrent

  /** Re-reads the stored document after a conflict or an external edit. */
  const reload = useCallback(() => setVersion((current) => current + 1), [])

  /** Folds a successful save into the loaded snapshot without a second read. */
  const applySave = useCallback(
    (saved: {
      contentMode: WikiContentMode
      sourceMarkdown: string
      revision: number
      document: WikiPublicStoryDocument
      warnings: WikiDocumentWarning[]
    }) => {
      setRequest((current) =>
        current.key === key && current.data
          ? {
              key,
              data: {
                ...current.data,
                contentMode: saved.contentMode,
                sourceMarkdown: saved.sourceMarkdown,
                revision: saved.revision,
                document: saved.document,
                warnings: saved.warnings,
                revisionsSummary: revisionsSummaryAfterSave(
                  current.data.revisionsSummary,
                  saved.revision
                ),
              },
              error: null,
            }
          : current
      )
    },
    [key]
  )

  return { data, error, loading, reload, applySave }
}

export type DocumentPreviewView = {
  /** Source the server last compiled; `null` before the first snapshot loads. */
  requestedSource: string | null
  document: WikiPublicStoryDocument | null
  warnings: WikiDocumentWarning[]
  loading: boolean
  error: unknown
  /** True while the server has not compiled the current draft yet. */
  stale: boolean
}

const EMPTY_PREVIEW: DocumentPreviewView = {
  requestedSource: null,
  document: null,
  warnings: [],
  loading: false,
  error: null,
  stale: false,
}

/** The stored snapshot already holds a compiled document: seed from it. */
function seedPreview(
  snapshot: WikiAdminEntryDocument | null
): DocumentPreviewView {
  if (!snapshot) return EMPTY_PREVIEW
  return {
    requestedSource: snapshot.sourceMarkdown,
    document: snapshot.document,
    warnings: snapshot.warnings,
    loading: false,
    error: null,
    stale: false,
  }
}

type PreviewState = {
  snapshot: WikiAdminEntryDocument | null
  preview: DocumentPreviewView
}

/**
 * Debounced server compile of the working draft.
 *
 * The stored snapshot seeds the pane so opening a document never costs a
 * request; every later edit lands as one `POST .../document/preview` after the
 * maintainer stops typing. Seeding is derived, not an effect, so a reload or a
 * save can never be overwritten by a stale state update.
 */
export function useDocumentPreview({
  entryId,
  enabled,
  source,
  snapshot,
  debounceMs = 400,
}: {
  entryId: number
  enabled: boolean
  source: string
  snapshot: WikiAdminEntryDocument | null
  debounceMs?: number
}) {
  const [state, setState] = useState<PreviewState>({
    snapshot: null,
    preview: EMPTY_PREVIEW,
  })
  const preview =
    state.snapshot === snapshot ? state.preview : seedPreview(snapshot)
  const requestedSource = preview.requestedSource

  useEffect(() => {
    if (!enabled || !snapshot) return
    if (requestedSource === source) return
    let cancelled = false
    const timer = setTimeout(() => {
      setState((current) => ({
        snapshot,
        preview: {
          ...(current.snapshot === snapshot
            ? current.preview
            : seedPreview(snapshot)),
          loading: true,
          error: null,
        },
      }))
      void previewAdminWikiEntryDocument({ entryId, sourceMarkdown: source })
        .send()
        .then((result) => {
          if (cancelled) return
          setState({
            snapshot,
            preview: {
              requestedSource: source,
              document: result.document,
              warnings: result.warnings,
              loading: false,
              error: null,
              stale: false,
            },
          })
        })
        .catch((error: unknown) => {
          if (cancelled) return
          setState((current) => ({
            snapshot,
            preview: {
              ...(current.snapshot === snapshot
                ? current.preview
                : seedPreview(snapshot)),
              loading: false,
              error,
            },
          }))
        })
    }, debounceMs)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [debounceMs, enabled, entryId, requestedSource, snapshot, source])

  return useMemo<DocumentPreviewView>(
    () => ({
      ...preview,
      stale:
        preview.requestedSource !== null && preview.requestedSource !== source,
    }),
    [preview, source]
  )
}
