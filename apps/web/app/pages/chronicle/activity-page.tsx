export function meta() {
  return [{ title: "活动纪年 | IMSWeb" }]
}

export default function ChronicleActivityPage({
  activityId,
}: {
  activityId: string
}) {
  return (
    <main id="main-content" className="mx-auto w-full max-w-5xl px-6 py-16">
      <h1 className="text-3xl font-semibold">活动纪年</h1>
      <p className="mt-4 leading-7 text-muted-foreground">
        活动编号：{activityId}
      </p>
    </main>
  )
}
