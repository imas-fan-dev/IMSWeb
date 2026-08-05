import type {
  WikiEntryKind,
  WikiImageTransform,
  WikiStoryEntrySubtype,
} from "@/ports/repositories";

export type WikiMediaFit = "contain" | "cover";
export type WikiMediaSource = "object-storage" | "none";

export interface WikiAgency {
  id: number;
  code: string;
  name: string;
  color: string;
  bannerTitle: string;
  iconUrl: string | null;
  layoutRevision: number;
  imageTransform: WikiImageTransform;
  mediaRevision: number;
}

export interface WikiIdol {
  id: number;
  agencyId: number;
  agencyCode: string;
  agencyName: string;
  agencyColor: string;
  name: string;
  folderName: string;
  color: string | null;
  wikiUrl: string | null;
  avatarUrl?: string;
  avatarFit?: WikiMediaFit;
  avatarTransform?: WikiImageTransform;
  mediaRevision?: number;
  avatarSource?: WikiMediaSource;
  textColor?: string;
  entryKind: WikiEntryKind;
  entrySubtype: WikiStoryEntrySubtype | null;
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
  contentType: string;
  contentTypeIcon: string;
  sourcePlatform: string;
}

export interface WikiStoryCard {
  id: number;
  name: string;
  img: string;
  subtitle: string;
  imageTransform: WikiImageTransform;
  links: WikiStoryLink[];
}

export interface WikiStoryCategory {
  name: string;
  cards: WikiStoryCard[];
}

export interface WikiRandomBackground {
  url: string;
  card_id?: number;
  card_name?: string;
  idol_name?: string;
  agency_name?: string;
}

export interface WikiRandomIdol {
  status: "success";
  eligibleCount: number;
  idol: {
    id: number;
    name: string;
    color: string | null;
    textColor: string;
    imageUrl: string;
    imageTransform: WikiImageTransform;
    agency: {
      id: number;
      code: string;
      name: string;
      color: string;
      iconUrl: string | null;
      imageTransform: WikiImageTransform;
    };
  } | null;
}
