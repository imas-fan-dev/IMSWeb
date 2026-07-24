import { EventsCenter } from "~/features/events/events-center"

export function meta() {
  return [
    { title: "活动中心 | IMSWeb" },
    {
      name: "description",
      content: "浏览 IMSWeb 制作人社区持续更新的国内活动。",
    },
  ]
}

export default function Events() {
  return <EventsCenter />
}
