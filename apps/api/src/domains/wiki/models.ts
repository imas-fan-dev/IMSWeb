export const SUPPORTED_AGENCY_CODES = ["765", "876", "cg", "ml", "sidem", "sc", "gk"] as const;

export type SupportedAgencyCode = (typeof SUPPORTED_AGENCY_CODES)[number];
export type WikiMediaFit = "contain" | "cover";
export type WikiMediaSource = "object-storage" | "legacy-character" | "legacy-agency";

export interface WikiAgency {
  id: number;
  code: SupportedAgencyCode;
  name: string;
  color: string;
}

export interface WikiIdol {
  id: number;
  agencyId: number;
  agencyCode: SupportedAgencyCode;
  agencyName: string;
  agencyColor: string;
  name: string;
  folderName: string;
  color: string | null;
  avatarUrl?: string;
  avatarFit?: WikiMediaFit;
  avatarSource?: WikiMediaSource;
  textColor?: string;
}

export interface WikiStoryRow {
  id: number;
  idolId: number;
  category: string;
  cardName: string;
  upName: string;
  videoTitle: string;
  url: string;
  subtitle: string | null;
  imageFile: string | null;
}

export interface WikiStoryLink {
  id: number;
  up: string;
  title: string;
  url: string;
}

export interface WikiStoryCard {
  name: string;
  img: string;
  subtitle: string;
  links: WikiStoryLink[];
}

export interface WikiStoryCategory {
  name: string;
  cards: WikiStoryCard[];
}

export interface WikiRandomBackground {
  url: string;
  card_name?: string;
  idol_name?: string;
  agency_name?: string;
}
