import type { AgencyTemplateProps } from "@/domains/wiki/templates/shared";
import { IdolTile, idolForMember, resolvedIdolColor } from "@/domains/wiki/templates/shared";

interface CinderellaUnit {
  id: string;
  name: string;
  icon: string;
  color: string;
  unvoicedColor: string;
  voiced: readonly string[];
  unvoiced: readonly string[];
}

const special = ["main_story", "event_story"];
const specialNames: Record<string, string> = { main_story: "主线剧情", event_story: "活动剧情" };
const lightMembers = new Set(["oikawa_shizuku", "及川雫"]);

const units: CinderellaUnit[] = [
  {
    id: "cute", name: "Cute", icon: "cute.webp", color: "#ff5085", unvoicedColor: "#ff8ba8",
    voiced: ["shimamura_uzuki", "nakano_yuka", "mizumoto_yukari", "shiina_noriko", "mimura_kanako", "kohinata_miho", "ogata_chieri", "igarashi_kyoko", "sakurai_momoka", "seki_hiromi", "munakata_atsumi", "fujimoto_rina", "yusa_kozue", "ichinose_shiki", "maekawa_miku", "miyamoto_frederica", "kobayakawa_sae", "saionji_kotoka", "futaba_anzu", "domyoji_karin", "koshimizu_sachiko", "abe_nana", "koga_koharu", "sakuma_mayu", "shiragiku_hotaru", "hayasaka_mirei", "otokura_yuuki", "tsujino_akari", "kurosaki_chitose", "shirayuki_chiyo"],
    unvoiced: ["fukuyama_mai", "imai_kana", "mochida_arisa", "okuyama_saori", "manaka_misato", "yanase_miyuki", "egami_tsubaki", "nagatomi_hasumi", "yokoyama_chika", "ohta_yuu", "ohara_michiru", "ohnuma_kurumi", "akanishi_erika", "matsubara_saya", "aihara_yukino", "yao_fueifuei", "momoi_azuki", "suzumiya_seika", "tsukimiya_miyabi", "hyodo_rena", "niwa_hitomi", "yanagi_kiyora", "imura_setsuna", "kusakabe_wakaba", "sakakibara_satomi", "anzai_miyako", "asano_fuka", "ohnishi_yuriko", "kudo_shinobu", "kurihara_nene", "clarice", "muramatsu_sakura", "ariura_kanna", "harada_miyo", "ikebukuro_akiha"],
  },
  {
    id: "cool", name: "Cool", icon: "cool.webp", color: "#0062ff", unvoicedColor: "#4d94ff",
    voiced: ["shibuya_rin", "kawashima_mizuki", "kamiya_nao", "kamijo_haruna", "araki_hina", "tada_riina", "sasaki_chie", "mifune_miyu", "fujiwara_hajime", "nitta_minami", "tachibana_arisu", "sagisawa_fumika", "yagami_makino", "layla", "asari_nanami", "matsunaga_ryo", "takagaki_kaede", "kanzaki_ranko", "hojo_karen", "sajo_yukimi", "shirasaka_koume", "shiomi_syuko", "wakiyama_tamami", "hayami_kanade", "ohishi_izumi", "morikubo_nono", "anastasia", "yamato_aki", "yuuki_haru", "ninomiya_asuka", "kiryu_tsukasa", "mochizuki_hijiri", "takafuji_kako", "sunazuka_akira", "hisakawa_hayate"],
    unvoiced: ["kurokawa_chiaki", "matsumoto_sarina", "kirino_aya", "takahashi_reiko", "aikawa_chinatsu", "togo_ai", "mizuki_seira", "hattori_toko", "kiba_manami", "mizuno_midori", "furusawa_yoriko", "helen", "komuro_chinami", "takamine_noa", "ijuin_megumi", "hiiragi_shino", "kate", "sena_shiori", "ayase_honoka", "shinohara_rei", "wakui_rumi", "yoshioka_saki", "umeki_otoha", "kishibe_ayaka", "ujiie_mutsumi", "nishikawa_honami", "narumiya_yume", "fujii_tomo", "okazaki_yasuha", "matsuo_chizuru"],
  },
  {
    id: "passion", name: "Passion", icon: "passion.webp", color: "#ff9d00", unvoicedColor: "#ffc04d",
    voiced: ["honda_mio", "takamori_aiko", "ryuzaki_kaoru", "kimura_natsuki", "akagi_miria", "ohtsuki_yui", "himekawa_yuki", "kitami_yuzu", "ueda_suzuho", "oikawa_shizuku", "koseki_reina", "hoshi_syoko", "katagiri_sanae", "hori_yuko", "matoba_risa", "yorita_yoshino", "aiba_yumi", "jougasaki_mika", "jougasaki_rika", "hino_akane", "moroboshi_kirari", "totoki_airi", "natalia", "mukai_takumi", "ichihara_nina", "kita_hinako", "namba_emi", "hamaguchi_ayame", "murakami_tomoe", "sato_shin", "nanjo_hikaru", "eve_santaclaus", "yumemi_riamu", "hisakawa_nagi"],
    unvoiced: ["namiki_meiko", "matsuyama_kumiko", "saito_yoko", "sawada_marina", "yaguchi_miu", "aino_nagisa", "manabe_itsuki", "ebihara_naho", "etou_misaki", "nishijima_kai", "zaizen_tokiko", "nonomura_sora", "hamakawa_ayuna", "wakabayashi_tomoka", "senzaki_ema", "soma_natsumi", "makihara_shiho", "sugisaka_umi", "kitagawa_mahiro", "mary_cochran", "komatsu_ibuki", "miyoshi_sana", "cathy_graham", "tsuchiya_ako", "shuto_aoi", "saejima_kiyomi"],
  },
];

function CinderellaTiles(props: AgencyTemplateProps & { members: readonly string[]; color: string }) {
  return (
    <>
      {props.members.map((member) => {
        const idol = idolForMember(props.idols, member);
        if (!idol) return null;
        return <IdolTile agency={props.agency} idol={idol} displayName={idol.name} color={resolvedIdolColor(idol, props.color)} lightName={lightMembers.has(member) || lightMembers.has(idol.name)} />;
      })}
    </>
  );
}

const toggleScript = `
function toggleCgUnvoiced(gridId, btnElement, unitName) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  if (grid.classList.contains('show')) {
    grid.classList.remove('show');
    btnElement.textContent = '🔽 展开 ' + unitName + ' 无声优偶像';
  } else {
    grid.classList.add('show');
    btnElement.textContent = '🔼 收起无声优偶像';
  }
}`;

export function AgencyCgTemplate(props: AgencyTemplateProps) {
  return (
    <div class="cg-wrapper">
      <div class="cg-banner"><h3>🏰 CINDERELLA 🏰</h3></div>
      <div class="cg-nav-bar">
        <a href="#section-cute" class="cg-nav-btn cute"><img src="/icon/cg/cute.webp" onerror="this.style.display='none'" /> Cute</a>
        <a href="#section-cool" class="cg-nav-btn cool"><img src="/icon/cg/cool.webp" onerror="this.style.display='none'" /> Cool</a>
        <a href="#section-passion" class="cg-nav-btn passion"><img src="/icon/cg/passion.webp" onerror="this.style.display='none'" /> Passion</a>
      </div>
      <div class="cg-unit-section" style="--unit-color: #2681c8;">
        <div class="cg-unit-title"><img src="/icon/cg/special.webp" class="cg-unit-logo" onerror="this.style.display='none'" /><span>特殊</span></div>
        <div class="cg-grid">
          {special.map((member) => {
            const idol = idolForMember(props.idols, member);
            if (!idol) return null;
            return <IdolTile agency={props.agency} idol={idol} displayName={specialNames[member]} color={resolvedIdolColor(idol, "#2681c8")} />;
          })}
        </div>
      </div>
      {units.map((unit) => (
        <div class="cg-unit-section" id={`section-${unit.id}`} style={`--unit-color: ${unit.color};`}>
          <div class="cg-unit-title"><img src={`/icon/cg/${unit.icon}`} class="cg-unit-logo" onerror="this.style.display='none'" /><span>{unit.name}</span></div>
          <div class="cg-grid"><CinderellaTiles {...props} members={unit.voiced} color={unit.color} /></div>
          <div class="cg-toggle-container">
            <button type="button" class="cg-toggle-btn" onclick={`toggleCgUnvoiced('unvoiced-${unit.id}', this, ${JSON.stringify(unit.name)})`}>🔽 展开 {unit.name} 无声优偶像</button>
          </div>
          <div class="cg-unvoiced-grid" id={`unvoiced-${unit.id}`}>
            <div class="cg-grid"><CinderellaTiles {...props} members={unit.unvoiced} color={unit.unvoicedColor} /></div>
          </div>
        </div>
      ))}
      <script dangerouslySetInnerHTML={{ __html: toggleScript }} />
    </div>
  );
}
