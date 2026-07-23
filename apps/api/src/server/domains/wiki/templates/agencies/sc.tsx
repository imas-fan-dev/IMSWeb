import type { AgencyTemplateProps, AgencyUnit } from "@/domains/wiki/templates/shared";
import { IdolTile, UnitLayout, resolvedIdolColor } from "@/domains/wiki/templates/shared";

const names: Record<string, string> = {
  enza_units: "enza组合", enza_festivals: "enza节日", scsp_event: "scsp活动", live: "直播", nanakusa_hazuki: "七草叶月",
  sakuragi_mano: "樱木真乃", kazano_hiori: "风野灯织", hachimiya_meguru: "八宫巡",
  tsukioka_kogane: "月冈恋钟", tanaka_mamimi: "田中摩美美", shirase_sakuya: "白濑咲耶", mitsumine_yuika: "三峰结华", yukoku_kiriko: "幽谷雾子",
  komiya_kaho: "小宫果穗", sonoda_chiyoko: "园田智代子", saijo_juri: "西城树里", morino_rinze: "杜野凛世", arisugawa_natsuha: "有栖川夏叶",
  osaki_amana: "大崎甘奈", osaki_tenka: "大崎甜花", kuwayama_chiyuki: "桑山千雪",
  serizawa_asahi: "芹泽朝日", mayuzumi_fuyuko: "黛冬优子", izumi_mei: "和泉爱依",
  asakura_toru: "浅仓透", higuchi_madoka: "樋口圆香", fukumaru_koito: "福丸小糸", ichikawa_hinana: "市川雏菜",
  nanakusa_nichika: "七草日花", aketa_mikoto: "绯田美琴", ikaruga_luca: "斑鸠路加", suzuki_hana: "铃木羽那", ikuta_haruki: "郁田阳希",
  ruby: "ルビー", memcho: "MEMちょ", arima_kana: "有馬かな", kurokawa_akane: "黒川あかね", collab: "联动活动",
};

const units: AgencyUnit[] = [
  { name: "特殊", icon: "special.webp", color: "#8dbbff", members: ["enza_units", "enza_festivals", "scsp_event", "live", "nanakusa_hazuki"] },
  { name: "illumination STARS", icon: "illumination_stars.webp", color: "#ffca00", members: ["sakuragi_mano", "kazano_hiori", "hachimiya_meguru"] },
  { name: "L'Antica", icon: "l_antica.webp", color: "#853998", members: ["tsukioka_kogane", "tanaka_mamimi", "shirase_sakuya", "mitsumine_yuika", "yukoku_kiriko"] },
  { name: "放学后Climax Girls", icon: "houkago_climax_girls.webp", color: "#fa8333", members: ["komiya_kaho", "sonoda_chiyoko", "saijo_juri", "morino_rinze", "arisugawa_natsuha"] },
  { name: "Alstroemeria", icon: "alstroemeria.webp", color: "#ff699e", members: ["osaki_amana", "osaki_tenka", "kuwayama_chiyuki"] },
  { name: "Straylight", icon: "straylight.webp", color: "#af011c", members: ["serizawa_asahi", "mayuzumi_fuyuko", "izumi_mei"] },
  { name: "noctchill", icon: "noctchill.webp", color: "#384d98", members: ["asakura_toru", "higuchi_madoka", "fukumaru_koito", "ichikawa_hinana"] },
  { name: "SHHis", icon: "shhis.webp", color: "#008e74", members: ["nanakusa_nichika", "aketa_mikoto"] },
  { name: "CoMETIK", icon: "cometik.webp", color: "#333333", members: ["ikaruga_luca", "suzuki_hana", "ikuta_haruki"] },
  { name: "联动", icon: "collab.webp", color: "#eb3ba6", members: ["ruby", "memcho", "arima_kana", "kurokawa_akane", "collab"] },
];

const knownMembers = new Set(units.flatMap((unit) => [...unit.members]));

export function AgencyScTemplate(props: AgencyTemplateProps) {
  const otherIdols = props.idols.filter((idol) => !knownMembers.has(idol.folderName) && !knownMembers.has(idol.name));
  return (
    <div>
      <div class="sc-banner"><h3>🦢 283 Production 🦢</h3></div>
      <UnitLayout {...props} units={units} names={names} namespace="sc" lightMembers={new Set(["kuwayama_chiyuki", "yukoku_kiriko"])} />
      {otherIdols.length ? (
        <div class="sc-unit-section" style="--unit-color: #777777;">
          <div class="sc-unit-title"><span>事务所人员 &amp; 其他未分类</span></div>
          <div class="sc-grid">
            {otherIdols.map((idol) => <IdolTile agency={props.agency} idol={idol} displayName={idol.name} color={resolvedIdolColor(idol, "#777777")} />)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
