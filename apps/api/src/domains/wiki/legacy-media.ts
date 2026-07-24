import type { WikiMediaFit, WikiMediaSource } from "@/domains/wiki/models";

export interface WikiAvatarMedia {
  url: string;
  fit: WikiMediaFit;
  source: WikiMediaSource;
}

const legacyCharacterMedia: Readonly<Record<string, string>> = {
  "765:amami_haruka": "/assets/images/Production/765Haruka.png",
  "765:hoshii_miki": "/assets/images/Information/mikipose.jpg",
  "cg:shimamura_uzuki": "/assets/images/Production/346Uzuki.png",
  "gk:hanami_saki": "/assets/images/Production/GakuenSaki.png",
  "gk:neo_asari": "/assets/images/Production/GakuenAsari.png",
  "ml:amami_haruka": "/assets/images/Production/765Haruka.png",
  "ml:hoshii_miki": "/assets/images/Information/mikipose.jpg",
  "ml:kasuga_mirai": "/assets/images/Production/765Mirai.png",
  "ml:sakuramori_kaori": "/assets/images/Kaori.png",
  "sc:sakuragi_mano": "/assets/images/Production/283Mano.png",
  "sidem:tendo_teru": "/assets/images/Production/315Teru.png",
};

const legacyCharacterMediaByName: Readonly<Record<string, string>> = {
  "765:天海春香": "/assets/images/Production/765Haruka.png",
  "765:星井美希": "/assets/images/Information/mikipose.jpg",
  "cg:岛村卯月": "/assets/images/Production/346Uzuki.png",
  "gk:根绪亚纱里": "/assets/images/Production/GakuenAsari.png",
  "gk:花海咲季": "/assets/images/Production/GakuenSaki.png",
  "ml:天海春香": "/assets/images/Production/765Haruka.png",
  "ml:星井美希": "/assets/images/Information/mikipose.jpg",
  "ml:春日未来": "/assets/images/Production/765Mirai.png",
  "ml:樱守歌织": "/assets/images/Kaori.png",
  "sc:樱木真乃": "/assets/images/Production/283Mano.png",
  "sidem:天道辉": "/assets/images/Production/315Teru.png",
};

const legacyAgencyLogos: Readonly<Record<string, string>> = {
  "765": "/assets/images/Production/765PRO.png",
  "876": "/icon/876pro.webp",
  cg: "/assets/images/Production/CinderellaGirls.png",
  gk: "/assets/images/Production/Gakuen.png",
  ml: "/assets/images/Production/Million.png",
  sc: "/assets/images/Production/Shinycolors.png",
  sidem: "/assets/images/Production/SideM.png",
};

const legacyAgencyArtwork: Readonly<Record<string, string>> = {
  "765PRO": "/assets/images/Production/765intro.png",
  "876PRO": "/icon/876pro.webp",
  "SideM": "/assets/images/Production/Sidemintro.png",
  "百万现场": "/assets/images/Production/Millionintro.png",
  "学园偶像大师": "/assets/images/Production/Gakuenintro.png",
  "灰姑娘女孩": "/assets/images/Production/Cinderellaintro.png",
  "闪耀色彩": "/assets/images/Production/Shinyintro.png",
};

export function legacyCharacterAvatarMedia(
  code: string,
  folderName: string,
  idolName: string,
): WikiAvatarMedia | null {
  const character = legacyCharacterMedia[`${code}:${folderName}`]
    ?? legacyCharacterMediaByName[`${code}:${idolName}`];
  return character ? { url: character, fit: "cover", source: "legacy-character" } : null;
}

export function legacyAvatarMedia(code: string, folderName: string, idolName: string): WikiAvatarMedia {
  return legacyCharacterAvatarMedia(code, folderName, idolName) ?? {
    url: legacyAgencyLogos[code] ?? "/assets/images/Production/765PRO.png",
    fit: "contain",
    source: "legacy-agency",
  };
}

export function legacyArtworkForAgency(agencyName: string): string {
  return legacyAgencyArtwork[agencyName] ?? legacyAgencyArtwork["765PRO"]!;
}
