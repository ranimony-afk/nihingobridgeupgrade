# NihongoBridge Flutter/Android Mobile Dictionary API Contract

**Phase**: 14.4A  
**Status**: APPROVED ARCHITECTURE  
**Target Client**: Future Cross-Platform Flutter Mobile Application (Android / iOS)  

---

## 1. Mobile UX Target & Navigation Architecture

The NihongoBridge mobile client architecture mirrors the ergonomic strengths of modern mobile Japanese dictionaries (e.g. Takoboto, Midori, Shirabe Jisho) while integrating NihongoBridge's multilingual Indian-language knowledge graph and AI tutoring.

### Core Bottom Navigation Structure
```
┌────────────────────────────────────────────────────────┐
│ [ Home ]   [ Search ]   [ Lists ]   [ Study ]   [ Profile ] │
└────────────────────────────────────────────────────────┘
```
1. **Home (ホーム)**: Daily word recommendation, quick search jump, streak / XP progress, daily review queue badge.
2. **Search (辞書検索)**: Multi-script omnibar (Kanji, Kana, Romaji, English, Tamil, Malayalam) with instant autocomplete.
3. **Lists (マイ単語帳)**: User-curated custom study decks, saved vocabulary, JLPT wordlists, export/import.
4. **Study (学習・SRS)**: Spaced repetition flashcards, multiple-choice quizzes, conjugation drills.
5. **Profile (マイページ)**: Known/learning word distribution, JLPT mastery tracker, offline dictionary download manager.

---

## 2. Mobile API Endpoints

All endpoints are versioned under `/api/v1/mobile/...` and emit compact, gzipped JSON payloads optimized for cellular networks.

### 2.1 Fast Autocomplete Endpoint
* **Route**: `GET /api/v1/mobile/dictionary/suggest`
* **Query Parameters**:
  * `q` (string, required): Partial query (e.g. `tabe`, `食`, `water`).
  * `limit` (number, optional, default: 10).
* **Response**:
```json
{
  "suggestions": [
    { "id": "de-jmdict-1358280", "headword": "食べる", "reading": "たべる", "romaji": "taberu", "gloss": "to eat", "jlpt": "N5" },
    { "id": "de-jmdict-1358300", "headword": "食べ物", "reading": "たべもの", "romaji": "tabemono", "gloss": "food", "jlpt": "N5" }
  ]
}
```

### 2.2 Multi-Target Mobile Search Endpoint
* **Route**: `POST /api/v1/mobile/dictionary/search`
* **Request Body**:
```json
{
  "query": "taberu",
  "filters": {
    "jlptLevel": "N5",
    "isCommon": true,
    "hasKeigo": true
  },
  "page": 1,
  "limit": 20,
  "targetLanguage": "ta"
}
```
* **Response**: Emits an array of `MobileDictionaryEntryCard` payloads for virtualized scrolling feeds.

### 2.3 Detailed Entry Page (Swipe Sections) Endpoint
* **Route**: `GET /api/v1/mobile/dictionary/entries/:id`
* **Query Parameters**:
  * `lang` (optional, default: `en`): Secondary localization code (`ta`, `ml`).
* **Response Structure**:
```json
{
  "id": "de-jmdict-1358280",
  "headword": "食べる",
  "reading": "たべる",
  "romaji": "taberu",
  "jlptLevel": "N5",
  "isCommon": true,
  "meanings": [
    {
      "order": 1,
      "partsOfSpeech": ["v1", "vt"],
      "glosses": ["to eat"],
      "localizedGlosses": {
        "ta": ["சாப்பிடு", "உண்"],
        "ml": ["കഴിക്കുക", "ഭക്ഷിക്കുക"]
      },
      "contextTags": ["standard"]
    }
  ],
  "conjugations": [
    {
      "form": "masu_present",
      "nameJa": "ます形",
      "nameEn": "Polite Non-Past",
      "affirmative": "食べます",
      "affirmativeReading": "たべます",
      "negative": "食べません",
      "negativeReading": "たべません",
      "politeness": "polite"
    }
  ],
  "keigo": {
    "standardForm": "食べる",
    "teineigo": ["食べます"],
    "sonkeigo": ["召し上がる", "お食べになる"],
    "kenjougo": ["いただく", "頂戴する"],
    "businessExample": {
      "japanese": "どうぞお召し上がりください。",
      "reading": "どうぞおめしあがりください。",
      "english": "Please enjoy your meal.",
      "tamil": "தயவுசெய்து சாப்பிடுங்கள்.",
      "malayalam": "ദയവായി കഴിച്ചാലും."
    }
  },
  "kanjiList": [
    {
      "character": "食",
      "meaning": "eat, food",
      "readings": { "on": ["ショク", "ジキ"], "kun": ["た.べる", "く.う"] },
      "strokeCount": 9,
      "strokeOrderSvgUrl": "/assets/kanji/098df.svg",
      "radical": "飠"
    }
  ],
  "exampleSentences": [
    {
      "id": "es-100234",
      "japanese": "朝ごはんを食べました。",
      "reading": "あさごはんをたべました。",
      "english": "I ate breakfast.",
      "tamil": "நான் காலை உணவு சாப்பிட்டேன்.",
      "sourceRef": "upstream:tatoeba:2023"
    }
  ],
  "provenance": {
    "sourceId": "upstream:jmdict:2023-08",
    "license": "CC-BY-SA-3.0",
    "attribution": "Electronic Dictionary Research and Development Group (EDRDG)"
  }
}
```

---

## 3. Versioned Offline Sync Architecture (Future Flutter Client)

To provide instant lookup when cellular network connectivity is unavailable, NihongoBridge defines a **versioned, incremental SQLite sync contract**.

### Sync Principles:
1. **Zero Database Mutation on the Client**: The local SQLite database is a synchronized read-replica of canonical PostgreSQL tables.
2. **Versioned Manifest Registry**: The server publishes immutable dataset release manifests (`/api/v1/mobile/sync/manifests`).
3. **Delta Patch Support**: Minor releases provide binary delta patches (brotli-compressed JSON diffs) to save mobile bandwidth.

```
┌────────────────────────────────────────────────────────┐
│                   SYNC WORKFLOW                        │
│                                                        │
│   Mobile App                   Server                  │
│       │                          │                     │
│       ├── Check Manifest ───────>│                     │
│       │                          │                     │
│       │<── Latest Manifest ──────┤ (Version: 2023-08)  │
│       │                          │                     │
│       ├── Compare Version ───────┤                     │
│       │   (Local: none / old)    │                     │
│       │                          │                     │
│       ├── Request Delta/Archive ─>│                    │
│       │                          │                     │
│       │<── Compressed Blob ──────┤                     │
│       │                          │                     │
│       └── Apply to Local SQLite ─┘                     │
└────────────────────────────────────────────────────────┘
```

---

## 4. Audio & OCR Service Boundary Contracts

### 4.1 Pronunciation Audio Contract
* **Audio Strategy**: Audio files are stored on CDN / object storage and referenced via immutable URLs.
* **Metadata Schema**:
```typescript
export interface PronunciationAudioMetadata {
  id: string;
  entryId: string;
  reading: string;
  audioUrl: string;
  sourceType: "native_speaker" | "verified_tts";
  speakerGender: "male" | "female";
  accentRegion: "tokyo" | "kansai";
  durationMs: number;
  license: string;
}
```

### 4.2 OCR & Camera Ingestion Boundary
* **Pipeline**: Camera Image → Native Google ML Kit / Tesseract on device → Japanese Text Tokens → `/api/v1/mobile/dictionary/search`.
* **Architecture Boundary**: The server receives segmented Japanese text tokens rather than processing heavy raw camera bitmaps, preserving server resources and learner privacy.

---

## 5. User Personalization & Study Sync

* **Private by Default**: Personal custom wordlists, user notes, and SRS study intervals belong strictly to the authenticated learner.
* **Bidirectional Sync**: The mobile client pushes study reviews (`/api/v1/mobile/srs/review`) and syncs custom wordlists using idempotent UUID ledgers.
* **Zero Canonical Pollution**: Learner study data, personal tags, and custom definitions NEVER modify underlying `dictionary_entries` or `kanji_entries`.
