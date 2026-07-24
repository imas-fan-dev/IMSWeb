import type { AgencyTemplateProps, AgencyUnit } from "@/domains/wiki/templates/shared";
import { UnitLayout } from "@/domains/wiki/templates/shared";

const names: Record<string, string> = {
  amami_haruka: "天海春香", kisaragi_chihaya: "如月千早", hoshii_miki: "星井美希",
  hagiwara_yukiho: "萩原雪步", takatsuki_yayoi: "高槻弥生", kikuchi_makoto: "菊地真",
  minase_iori: "水濑伊织", shijou_takane: "四条贵音", akizuki_ritsuko: "秋月律子",
  miura_azusa: "三浦梓", futami_ami: "双海亚美", futami_mami: "双海真美",
  ganaha_hibiki: "我那霸响", leon: "玲音", shika: "诗花", okuzora_kohaku: "奥空心白", aya: "亚夜",
};

const units: AgencyUnit[] = [
  {
    name: "765PRO", icon: "765pro.webp", color: "#f34f6d",
    members: ["amami_haruka", "kisaragi_chihaya", "hoshii_miki", "hagiwara_yukiho", "takatsuki_yayoi", "kikuchi_makoto", "minase_iori", "shijou_takane", "akizuki_ritsuko", "miura_azusa", "futami_ami", "futami_mami", "ganaha_hibiki"],
  },
  {
    name: "961PRO", icon: "961pro.webp", color: "#333333",
    members: ["leon", "shika", "okuzora_kohaku", "aya"],
  },
];

export function Agency765Template(props: AgencyTemplateProps) {
  return (
    <div>
      <div class="pro765-banner"><h3>🎀 765PRO ALLSTARS 🎀</h3></div>
      <UnitLayout {...props} units={units} names={names} namespace="765" sectionClass="ml-unit-section" titleClass="ml-unit-title" gridClass="ml-grid" logoClass="ml-unit-logo" />
    </div>
  );
}
