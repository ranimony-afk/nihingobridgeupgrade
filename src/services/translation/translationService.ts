import { db } from "@/db";
import { entityTranslations } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  type SupportedLanguage,
  type SupportedEntityType,
  type SupportedSourceType,
  type CreateTranslationInput,
  type EntityTranslation,
  SUPPORTED_LANGUAGES,
  SUPPORTED_ENTITY_TYPES,
  SUPPORTED_SOURCE_TYPES,
} from "@/types/translation";
import crypto from "crypto";

export function normalizeTranslatedText(text: string): string {
  if (!text) return "";
  // NFC normalization ensures composite Unicode glyphs in Tamil/Malayalam match uniformly
  return text.trim().normalize("NFC");
}

export function generateTranslationId(
  entityType: string,
  entityId: string,
  language: string,
  translatedText: string
): string {
  const norm = normalizeTranslatedText(translatedText).toLowerCase();
  const hash = crypto.createHash("sha256").update(`${entityType}:${entityId}:${language}:${norm}`).digest("hex").slice(0, 12);
  return `tr-${entityType.slice(0, 3)}-${language}-${hash}`;
}

export class TranslationService {
  static validateInput(input: CreateTranslationInput): void {
    if (!SUPPORTED_LANGUAGES.includes(input.language)) {
      throw new Error(`Unsupported language "${input.language}". Must be one of: ${SUPPORTED_LANGUAGES.join(", ")}`);
    }
    if (!SUPPORTED_ENTITY_TYPES.includes(input.entityType)) {
      throw new Error(`Unsupported entityType "${input.entityType}". Must be one of: ${SUPPORTED_ENTITY_TYPES.join(", ")}`);
    }
    if (!SUPPORTED_SOURCE_TYPES.includes(input.sourceType)) {
      throw new Error(`Unsupported sourceType "${input.sourceType}". Must be one of: ${SUPPORTED_SOURCE_TYPES.join(", ")}`);
    }
    if (!input.entityId || !input.entityId.trim()) {
      throw new Error("entityId is required");
    }
    if (!input.translatedText || !normalizeTranslatedText(input.translatedText)) {
      throw new Error("translatedText is required");
    }
  }

  /**
   * Upsert a translation idempotently.
   * If translation exists with same (entityType, entityId, language, translatedText):
   * - Will upgrade verification status if new input is verified.
   * - Does not duplicate or corrupt canonical data.
   */
  static async addTranslation(input: CreateTranslationInput): Promise<EntityTranslation> {
    this.validateInput(input);
    const normalizedText = normalizeTranslatedText(input.translatedText);
    const id = generateTranslationId(input.entityType, input.entityId, input.language, normalizedText);

    const isVerified = Boolean(input.isVerified || input.sourceType === "canonical" || input.sourceType === "verified_human");

    const [row] = await db
      .insert(entityTranslations)
      .values({
        id,
        entityType: input.entityType,
        entityId: input.entityId.trim(),
        language: input.language,
        translatedText: normalizedText,
        secondaryText: input.secondaryText ? input.secondaryText.trim() : null,
        contextNotes: input.contextNotes ? input.contextNotes.trim() : null,
        sourceType: input.sourceType,
        sourceRef: input.sourceRef ?? null,
        isVerified,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          entityTranslations.entityType,
          entityTranslations.entityId,
          entityTranslations.language,
          entityTranslations.translatedText,
        ],
        set: {
          secondaryText: input.secondaryText ? input.secondaryText.trim() : sql`${entityTranslations.secondaryText}`,
          contextNotes: input.contextNotes ? input.contextNotes.trim() : sql`${entityTranslations.contextNotes}`,
          sourceType: input.sourceType === "verified_human" ? "verified_human" : sql`${entityTranslations.sourceType}`,
          isVerified: isVerified ? true : sql`${entityTranslations.isVerified}`,
          updatedAt: new Date(),
        },
      })
      .returning();

    return row as EntityTranslation;
  }

  /**
   * Retrieve translations for a given entity, optionally filtered by language.
   */
  static async getTranslations(
    entityType: SupportedEntityType,
    entityId: string,
    language?: SupportedLanguage
  ): Promise<EntityTranslation[]> {
    const conditions = [
      eq(entityTranslations.entityType, entityType),
      eq(entityTranslations.entityId, entityId),
    ];

    if (language) {
      if (!SUPPORTED_LANGUAGES.includes(language)) {
        throw new Error(`Unsupported language: ${language}`);
      }
      conditions.push(eq(entityTranslations.language, language));
    }

    const rows = await db
      .select()
      .from(entityTranslations)
      .where(and(...conditions));

    return rows as EntityTranslation[];
  }

  /**
   * Upgrade translation to human-verified.
   */
  static async verifyTranslation(translationId: string): Promise<boolean> {
    const res = await db
      .update(entityTranslations)
      .set({
        isVerified: true,
        sourceType: "verified_human",
        updatedAt: new Date(),
      })
      .where(eq(entityTranslations.id, translationId))
      .returning({ id: entityTranslations.id });

    return res.length > 0;
  }
}
