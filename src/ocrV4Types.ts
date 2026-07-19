import { Accessory, AccessoryQuality, AccessorySlot, DisplayStat } from "./domain";

export type OcrProfile = "minecraft-1.21.8" | "modernui-source-han" | "unknown";

export type OcrEvidenceSource = "template" | "tesseract" | "dictionary" | "constraint";

export interface OcrCandidate<T> {
  value: T;
  source: OcrEvidenceSource;
  score: number;
  rawText?: string;
}

export interface OcrFieldResult<T> {
  value: T;
  state: "accepted" | "needs-review";
  confidence: number;
  candidates: OcrCandidate<T>[];
  reasons: string[];
}

export interface OcrAffixFieldResult {
  id: string;
  stat: OcrFieldResult<DisplayStat>;
  value: OcrFieldResult<number>;
  rawLabel: string;
  rawValue: string;
}

export interface OcrReviewFields {
  name: OcrFieldResult<string>;
  quality: OcrFieldResult<AccessoryQuality>;
  slot: OcrFieldResult<AccessorySlot>;
  level: OcrFieldResult<number>;
  affixes: OcrAffixFieldResult[];
}

export interface ParsedAccessoryV4 {
  accessory: Accessory;
  rawText: string;
  warnings: string[];
  profile: OcrProfile;
  profileConfidence: number;
  profileReasons: string[];
  diagnostics: string[];
  fields: OcrReviewFields;
  tooltipImageUrl?: string;
  tooltipCropReason?: string;
}
