import {
  communityContentSchema,
  type CommunityContent,
} from "@imsweb/contracts/community-content"
import { communityApiPath } from "@imsweb/contracts/paths"
import type { ApiDispatcher, ApiTimes } from "./api-dispatcher"
export const communityLandingFixture: CommunityContent = {
  version: 1,
  title: "制作人社区",
  introduction: "浏览制作人社群、名片与共同创作的社区内容。",
  updatedAt: null,
  entries: [
    {
      id: "exchange",
      title: "名片交换事务所",
      description: "寻找事务所",
      href: "/community/exchange",
      icon: "building",
      imageUrl: null,
      enabled: true,
      audience: "all",
      availability: "exchange",
    },
    {
      id: "events",
      title: "社区动态",
      description: "查看社区动态",
      href: "/events",
      icon: "calendar",
      imageUrl: null,
      enabled: true,
      audience: "app",
      availability: "always",
    },
    {
      id: "cards",
      title: "制作人名片墙",
      description: "浏览名片",
      href: "/community/cards",
      icon: "users",
      imageUrl: null,
      enabled: true,
      audience: "all",
      availability: "always",
    },
    {
      id: "map",
      title: "全国支部地图",
      description: "寻找社群",
      href: "/producer-map",
      icon: "map-pin",
      imageUrl: null,
      enabled: true,
      audience: "all",
      availability: "always",
    },
    {
      id: "game",
      title: "板板大暴走",
      description: "同人游戏",
      href: "/runninggame/",
      icon: "gamepad",
      imageUrl: null,
      enabled: true,
      audience: "web",
      availability: "always",
    },
  ],
}
export function installCommunityContentMock(
  api: ApiDispatcher,
  times: ApiTimes,
  content: CommunityContent = communityLandingFixture
) {
  api.expect({
    name: "configured community landing",
    method: "GET",
    path: communityApiPath("/content"),
    responses: { 200: communityContentSchema },
    times,
    handle: () => ({ status: 200, json: content }),
  })
}
