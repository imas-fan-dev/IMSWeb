import type { AgencyTemplateProps, AgencyUnit } from "@/domains/wiki/templates/shared";
import { UnitLayout } from "@/domains/wiki/templates/shared";

const names: Record<string, string> = {
  reading_play: "朗读剧", growing_stars: "成长之星", jupiter: "Jupiter", dramatic_stars: "DRAMATIC STARS",
  altessimo: "Altessimo", beit: "Beit", w: "W", frame: "FRAME", sai: "彩", high_joker: "High×Joker",
  shinsoku_ikkon: "神速一魂", cafe_parade: "Café Parade", mofumofuen: "もふもふえん", sem: "S.E.M",
  the_kogadou: "THE 虎牙道", flags: "F-LAGS", legenders: "Legenders", c_first: "C.FIRST",
};

const special: AgencyUnit[] = [
  { name: "特殊", icon: "special.webp", color: "#0fbe94", members: ["reading_play", "growing_stars"] },
];

const groups: AgencyUnit[] = [
  { name: "组合", icon: "unit.webp", color: "#0fbe94", members: ["jupiter", "dramatic_stars", "altessimo", "beit", "w", "frame", "sai", "high_joker", "shinsoku_ikkon", "cafe_parade", "mofumofuen", "sem", "the_kogadou", "flags", "legenders", "c_first"] },
];

export function AgencySidemTemplate(props: AgencyTemplateProps) {
  return (
    <div>
      <div class="sidem-banner"><h3>🦅 315 Production 🦅</h3></div>
      <UnitLayout {...props} units={special} names={names} namespace="sidem" sectionClass="ml-unit-section" titleClass="ml-unit-title" gridClass="ml-grid" logoClass="ml-unit-logo" fallbackTiles />
      <UnitLayout {...props} units={groups} names={names} namespace="sidem" sectionClass="ml-unit-section" titleClass="ml-unit-title" gridClass="ml-grid" logoClass="ml-unit-logo" fallbackTiles />
    </div>
  );
}
