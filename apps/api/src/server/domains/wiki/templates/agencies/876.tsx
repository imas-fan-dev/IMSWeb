import type { AgencyTemplateProps, AgencyUnit } from "@/domains/wiki/templates/shared";
import { UnitLayout } from "@/domains/wiki/templates/shared";

const names: Record<string, string> = {
  hidaka_ai: "日高爱", mizutani_eri: "水谷绘理", akizuki_ryo: "秋月凉",
  tomori_manaka: "灯里爱夏", kamizuru_cosmo: "上水流宇宙", letora: "蕾特拉",
};

const units: AgencyUnit[] = [
  { name: "深情之星", icon: "876.webp", color: "#ff79a1", members: ["hidaka_ai", "mizutani_eri", "akizuki_ryo"] },
  { name: "vα-liv", icon: "valiv.webp", color: "#7b68ee", members: ["tomori_manaka", "kamizuru_cosmo", "letora"] },
];

export function Agency876Template(props: AgencyTemplateProps) {
  return (
    <div>
      <div class="pro876-banner"><h3>🍀 876PRO 🍀</h3></div>
      <UnitLayout {...props} units={units} names={names} namespace="876" sectionClass="ml-unit-section" titleClass="ml-unit-title" gridClass="ml-grid" logoClass="ml-unit-logo" />
    </div>
  );
}
