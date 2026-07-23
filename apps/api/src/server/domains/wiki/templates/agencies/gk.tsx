import type { AgencyTemplateProps, AgencyUnit } from "@/domains/wiki/templates/shared";
import { UnitLayout } from "@/domains/wiki/templates/shared";

const names: Record<string, string> = {
  main_story: "主线剧情", event_story: "活动剧情", s_card: "S卡", neo_asari: "根绪亚纱里",
  hanami_saki: "花海咲季", tsukimura_temari: "月村手毬", fujita_kotone: "藤田琴音",
  arimura_mao: "有村麻央", katsuragi_liliya: "葛城莉莉娅", kuramoto_china: "仓本千奈",
  shiun_sumika: "紫云清夏", shinosawa_hiro: "篠泽广", himesaki_riha: "姬崎莉波",
  hanami_ume: "花海佑芽", hataya_misuzu: "秦谷美铃", juo_sena: "十王星南", amaya_tsubame: "雨夜燕",
};

const units: AgencyUnit[] = [
  { name: "特殊", icon: "special.webp", color: "#3f51b5", members: ["main_story", "event_story", "s_card", "neo_asari"] },
  { name: "初星学园", icon: "hatsuboshi_gakuen.webp", color: "#ff9800", members: ["hanami_saki", "tsukimura_temari", "fujita_kotone", "arimura_mao", "katsuragi_liliya", "kuramoto_china", "shiun_sumika", "shinosawa_hiro", "himesaki_riha", "hanami_ume", "hataya_misuzu", "juo_sena", "amaya_tsubame"] },
];

export function AgencyGkTemplate(props: AgencyTemplateProps) {
  return (
    <div>
      <div class="gk-banner"><h3>🌟 初星学园 🌟</h3></div>
      <UnitLayout {...props} units={units} names={names} namespace="gk" />
    </div>
  );
}
