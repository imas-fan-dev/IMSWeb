import type { AgencyTemplateProps, AgencyUnit } from "@/domains/wiki/templates/shared";
import { UnitLayout } from "@/domains/wiki/templates/shared";

const units: AgencyUnit[] = [
  { name: "特殊", icon: "special.webp", color: "#3f51b5", members: ["main_story", "event_story", "festival_story", "management_birthday", "aoba_misaki", "shika", "leon", "346_pro", "ichinose_shiki"] },
  { name: "765PRO ALLSTARS", icon: "765pro.webp", color: "#f34f6d", members: ["amami_haruka", "kisaragi_chihaya", "hoshii_miki", "hagiwara_yukiho", "takatsuki_yayoi", "kikuchi_makoto", "minase_iori", "shijou_takane", "akizuki_ritsuko", "miura_azusa", "futami_ami", "futami_mami", "ganaha_hibiki"] },
  { name: "PRINCESS STARS", icon: "princess.webp", color: "#ea5b76", members: ["kasuga_mirai", "tanaka_kotoha", "satake_minako", "tokugawa_matsuri", "nanao_yuriko", "takayama_sayoko", "matsuda_arisa", "kousaka_umi", "nakatani_iku", "emily_stewart", "yabuki_kana", "yokoyama_nao", "fukuda_noriko"] },
  { name: "FAIRY STARS", icon: "fairy.webp", color: "#0074b3", members: ["mogami_shizuka", "tokoro_megumi", "roco", "tenkubashi_tomoka", "kitazawa_shiho", "maihama_ayumu", "nikaido_chizuru", "makabe_mizuki", "momose_rio", "nagayoshi_subaru", "suou_momoko", "julia", "shiraishi_tsumugi"] },
  { name: "ANGEL STARS", icon: "angel.webp", color: "#fec352", members: ["ibuki_tsubasa", "shimabara_elena", "hakozaki_serika", "nonohara_akane", "mochizuki_anna", "kinoshita_hinata", "baba_konomi", "oogami_tamaki", "toyokawa_fuka", "miyao_miya", "shinomiya_karen", "kitakami_reika", "sakuramori_kaori"] },
];

export function AgencyMlTemplate(props: AgencyTemplateProps) {
  return (
    <div>
      <div class="ml-banner"><h3>🦋 百万现场 剧场时光 🦋</h3></div>
      <UnitLayout {...props} units={units} names={{}} namespace="ml" />
    </div>
  );
}
