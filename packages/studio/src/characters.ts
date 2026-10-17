/**
 * Character consistency: a registry of recurring characters and the prompt text that pins them.
 * Ported from the author's own `wiza` repo (MIT). Wiza's two sample characters are not included.
 */
export interface Character {
  id: string;
  name: string;
  /** Token a model or LoRA is trained to recognise, e.g. "[char:elena]". */
  trigger: string;
  description: string;
  negativePrompt: string;
  loraWeight: number;
  faceIdWeight: number;
}

export interface CharacterInput {
  name: string;
  description: string;
  id?: string;
  trigger?: string;
  negativePrompt?: string;
  loraWeight?: number;
  faceIdWeight?: number;
}

const DEFAULT_NEGATIVE = "blurry, low resolution, warped features";

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function weight(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("weights must be between 0 and 1");
  return value;
}

export function defineCharacter(input: CharacterInput): Character {
  const name = input.name.trim();
  const description = input.description.trim();
  if (!name || !description) throw new Error("name and description are required");
  const key = slug(name);
  if (!key) throw new Error("name must contain letters or digits");
  return {
    id: input.id ?? `char_${key}`,
    name,
    trigger: input.trigger ?? `[char:${key}]`,
    description,
    negativePrompt: input.negativePrompt?.trim() || DEFAULT_NEGATIVE,
    loraWeight: weight(input.loraWeight, 0.85),
    faceIdWeight: weight(input.faceIdWeight, 0.9),
  };
}

export interface ConditionedPrompt {
  prompt: string;
  negativePrompt: string;
}

/** Put every named character's trigger and description in front of the scene prompt. */
export function conditionPrompt(prompt: string, negativePrompt: string, characters: Character[]): ConditionedPrompt {
  const scene = prompt.trim();
  if (!scene) throw new Error("prompt is required");
  const lead = characters.map((c) => `${c.trigger} (${c.description})`).join(", ");
  const negatives = [...characters.map((c) => c.negativePrompt), negativePrompt.trim()].filter(Boolean);
  return {
    prompt: lead ? `${lead}, ${scene}` : scene,
    negativePrompt: [...new Set(negatives)].join(", "),
  };
}
