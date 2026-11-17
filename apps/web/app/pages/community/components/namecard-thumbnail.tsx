import { useState } from "react"

import { cn } from "~/lib/utils"

export function NamecardThumbnail({
  thumbnail,
  original,
}: {
  thumbnail: string
  original: string
}) {
  const [image, setImage] = useState({
    src: thumbnail,
    status: "loading" as "loading" | "ready" | "error",
  })

  return (
    <>
      {image.status === "loading" ? (
        <span
          role="status"
          className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
        >
          正在载入图片…
        </span>
      ) : null}
      {image.status === "error" ? (
        <span
          role="alert"
          className="absolute inset-0 flex items-center justify-center px-4 text-sm text-muted-foreground"
        >
          图片暂时无法显示
        </span>
      ) : null}
      <img
        key={image.src}
        src={image.src}
        alt=""
        loading="lazy"
        className={cn(
          "absolute inset-0 size-full object-contain",
          image.status === "error" && "invisible"
        )}
        onLoad={() => setImage((current) => ({ ...current, status: "ready" }))}
        onError={() =>
          setImage((current) =>
            current.src !== original
              ? { src: original, status: "loading" }
              : { ...current, status: "error" }
          )
        }
      />
    </>
  )
}
