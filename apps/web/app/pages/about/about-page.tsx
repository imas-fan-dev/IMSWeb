export function meta() {
  return [{ title: "关于我们 | IMSWeb" }]
}

export default function About() {
  return (
    <main id="main-content" className="mx-auto w-full max-w-5xl px-6 py-16">
      <h1 className="text-3xl font-semibold">关于我们</h1>
      <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
        由制作人共同维护的偶像大师中文资料与社区站点。
      </p>
    </main>
  )
}
