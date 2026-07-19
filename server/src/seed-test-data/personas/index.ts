import { PersonaDataset, PersonaKey } from "../seed-types";
import { ENGINEERING_MANAGER } from "./engineering-manager";
import { FOUNDER } from "./founder";
import { PRODUCT_MANAGER } from "./product-manager";

const DATASETS: Record<PersonaKey, PersonaDataset> = {
  "product-manager": PRODUCT_MANAGER,
  founder: FOUNDER,
  "engineering-manager": ENGINEERING_MANAGER,
};

export function getPersonaDataset(persona: PersonaKey): PersonaDataset {
  return DATASETS[persona];
}

export const PERSONA_LABELS: Record<PersonaKey, string> = {
  "product-manager": PRODUCT_MANAGER.label,
  founder: FOUNDER.label,
  "engineering-manager": ENGINEERING_MANAGER.label,
};
