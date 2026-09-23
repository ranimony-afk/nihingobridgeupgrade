# NihongoBridge Keigo & Pragmatic Register Architecture

**Phase**: 14.4A  
**Status**: APPROVED ARCHITECTURE  
**Target**: Comprehensive Japanese Honorific, Humble, and Situational Politeness Engine  

---

## 1. Keigo Taxonomy & Linguistic Foundation

Japanese honorific speech (*Keigo* / 敬語) is not merely a collection of polite synonyms; it is a **functional pragmatic transformation** that encodes social distance, in-group/out-group (*uchi/soto*) boundaries, and relative hierarchy between speaker, listener, and referent.

NihongoBridge models Keigo across four strictly classified categories:

```
                            ┌─────────────────────────────────────────┐
                            │            JAPANESE KEIGO               │
                            └───────────────────┬─────────────────────┘
                                                │
         ┌──────────────────────┬───────────────┴───────────────┬──────────────────────┐
         ▼                      ▼                               ▼                      ▼
┌──────────────────┐  ┌──────────────────┐            ┌──────────────────┐  ┌──────────────────┐
│  丁寧語 Teineigo │  │  尊敬語 Sonkeigo │            │ 謙譲語 Kenjougo I│  │ 謙譲語II 丁重語  │
│  (Polite Speech) │  │  (Respectful)    │            │ (Humble/Audience)│  │ (Courteous)      │
├──────────────────┤  ├──────────────────┤            ├──────────────────┤  ├──────────────────┤
│ Expresses polite │  │ Elevates the     │            │ Lowers speaker's │  │ Polite speech    │
│ deference to the │  │ actions/status of│            │ action directed  │  │ about self       │
│ listener.        │  │ listener/superior│            │ towards superior.│  │ regardless of obj│
│ e.g. です / ます │  │ e.g. 召し上がる  │            │ e.g. 伺う / 拝見 │  │ e.g. 参る/いたす │
└──────────────────┘  └──────────────────┘            └──────────────────┘  └──────────────────┘
```

---

## 2. Multi-Dimensional Register Hierarchy

NihongoBridge avoids a simplistic linear formality scale. An utterance exists at an intersection of multiple communicative dimensions:

* **Formality**: `CASUAL` → `STANDARD` → `POLITE` → `FORMAL` → `BUSINESS`
* **Pragmatic Orientation**:
  * Neutral: Standard reference without status elevation.
  * *Sonkeigo* (尊敬語): Other-elevating (+Respect).
  * *Kenjougo* (謙譲語): Self-lowering (+Humility).
* **Communication Channel**: `spoken` vs `written` (e.g. `言う` vs `述べる` vs `申し上げる`).
* **Relational Axis (*Uchi / Soto*)**:
  * *Uchi* (Inside/Family/Company): Humility applied to self and company members when speaking to clients.
  * *Soto* (Outside/Client/Guest): Honorifics applied to external parties.

---

## 3. Relational Keigo Entity Model

Each Keigo transformation is modeled as an edge linking two canonical dictionary entries:

```typescript
export interface KeigoRelation {
  id: string;
  standardEntryId: string;    // e.g. "de-jmdict-1358280" (食べる)
  keigoEntryId: string;        // e.g. "de-jmdict-1158520" (いただく)
  keigoType: "TEINEIGO" | "SONKEIGO" | "KENJOUGO_I" | "KENJOUGO_II";
  meaning: string;
  directionality: "speaker_lowering" | "listener_elevating" | "neutral_courteous";
  contextUsage: string;
  exampleSentence: {
    japanese: string;
    reading: string;
    english: string;
    tamil?: string;
    malayalam?: string;
  };
  notes?: string;
  sourceRef: string;
  verificationStatus: "machine" | "review" | "human_verified" | "published";
}
```

---

## 4. Core Irregular Keigo Mappings & Trilingual Grounding

The following canonical verbs exhibit distinct lexical substitutions across polite, honorific, and humble registers:

### 1. する (To do)
* **Standard**: する (`suru`)
* **Teineigo (Polite)**: します (`shimasu`)
* **Sonkeigo (Honorific)**: なさる (`nasaru`) / される (`sareru`)
* **Kenjougo (Humble)**: いたす (`itasu`)
* **Trilingual Context**:
  * **English**: "I will verify this." (Business: "こちらで確認いたします。")
  * **Tamil**: "நான் இதை சரிபார்க்கிறேன்." (மரியாதையான வணிக பயன்பாடு)
  * **Malayalam**: "ഞാൻ ഇത് പരിശോധിക്കാം." (വിനീതമായ ബിസിനസ് പ്രയോഗം)

### 2. 食べる / 飲む (To eat / drink)
* **Standard**: 食べる (`taberu`) / 飲む (`nomu`)
* **Teineigo**: 食べます (`tabemasu`) / 飲みます (`nomimasu`)
* **Sonkeigo**: 召し上がる (`meshiagaru`)
* **Kenjougo**: いただく (`itadaku`) / 頂戴する (`choudai suru`)
* **Trilingual Context**:
  * **English**: "Please enjoy your meal." (Honorific: "どうぞお召し上がりください。")
  * **Tamil**: "தயவுசெய்து சாப்பிடுங்கள்." (உயர்ந்த மரியாதை)
  * **Malayalam**: "ദയവായി കഴിച്ചാലും." (ആദരവോടെയുള്ള പ്രയോഗം)

### 3. 行く / 来る (To go / come)
* **Standard**: 行く (`iku`) / 来る (`kuru`)
* **Teineigo**: 行きます (`ikimasu`) / 来ます (`kimasu`)
* **Sonkeigo**: いらっしゃる (`irassharu`) / おいでになる (`oideninaru`)
* **Kenjougo I**: 伺う (`ukagau` - to visit someone's place)
* **Kenjougo II (丁重語)**: 参る (`mairu` - to go/come neutrally humble)

### 4. 言う (To say)
* **Standard**: 言う (`iu`)
* **Teineigo**: 言います (`iimasu`)
* **Sonkeigo**: おっしゃる (`ossharu`)
* **Kenjougo I**: 申し上げる (`moushiageru` - to tell a superior)
* **Kenjougo II**: 申す (`mousu` - to say one's name/state)

### 5. 見る (To see / watch)
* **Standard**: 見る (`miru`)
* **Teineigo**: 見ます (`mimasu`)
* **Sonkeigo**: ご覧になる (`goranninaru`)
* **Kenjougo**: 拝見する (`haikensuru`)

### 6. 聞く / 尋ねる (To hear / ask)
* **Standard**: 聞く (`kiku`)
* **Teineigo**: 聞きます (`kikimasu`)
* **Sonkeigo**: お聞きになる (`okikininaru`)
* **Kenjougo**: 伺う (`ukagau` - to inquire/listen to superior) / 拝聴する (`haichousuru`)

### 7. 知る (To know)
* **Standard**: 知る (`shiru`) / 知っている (`shitteiru`)
* **Teineigo**: 知っています (`shitteimasu`)
* **Sonkeigo**: ご存じ (`gozonji`) / ご存じだ (`gozonji da`)
* **Kenjougo**: 存じる (`zonjiru`) / 存じ上げる (`zonjiageru`)

### 8. 会う (To meet)
* **Standard**: 会う (`au`)
* **Teineigo**: 会います (`aimasu`)
* **Sonkeigo**: お会いになる (`oaininaru`)
* **Kenjougo**: お目にかかる (`omenikakaru`)

### 9. いる (To exist / be - animate)
* **Standard**: いる (`iru`)
* **Teineigo**: います (`imasu`)
* **Sonkeigo**: いらっしゃる (`irassharu`) / おいでになる (`oideninaru`)
* **Kenjougo II**: おる (`oru`)

### 10. もらう / あげる / くれる (Giving & Receiving)
* **もらう (Receive)**:
  * Sonkeigo: N/A (focuses on recipient)
  * Kenjougo: いただく (`itadaku`) / 頂戴する (`choudaisuru`)
* **あげる (Give)**:
  * Kenjougo: 差し上げる (`sashiageru`)
* **くれる (Give to me)**:
  * Sonkeigo: くださる (`kudasaru`)

---

## 5. Takoboto-Class Keigo UI Presentation

When viewing a verb with Keigo transformations (e.g. `食べる`), the entry page presents a structured card:

```
┌─────────────────────────────────────────────────────────────┐
│ 食べる 【たべる・taberu】                         JLPT N5   │
│ Meaning: to eat; to consume                                 │
├─────────────────────────────────────────────────────────────┤
│ KEIGO & REGISTER BREAKDOWN (敬語・レジスター)               │
│                                                             │
│ [Standard / 辞書形]                                         │
│   食べる (taberu) — Casual / Dictionary                     │
│                                                             │
│ [丁寧語 Teineigo / Polite]                                  │
│   食べます (tabemasu)                                       │
│   Usage: Standard polite conversation with acquaintances.   │
│                                                             │
│ [尊敬語 Sonkeigo / Honorific]                               │
│   召し上がる (meshiagaru)                                   │
│   Usage: Elevates the listener's action.                    │
│   Warning: NEVER use to describe your own eating!          │
│                                                             │
│ [謙譲語 Kenjougo / Humble]                                  │
│   いただく (itadaku)                                        │
│   Usage: Lowers speaker's action when receiving/eating.     │
│   Warning: NEVER use to command a customer to eat!         │
│                                                             │
│ BUSINESS JAPANESE EXAMPLE:                                  │
│   どうぞ温かいうちにお召し上がりください。                  │
│   "Please enjoy it while it is still warm."                 │
│   தமிழ்: "சூடாக இருக்கும்போதே தயவுசெய்து சாப்பிடுங்கள்."   │
│   മലയാളം: "ചൂടോടെ തന്നെ ദയവായി കഴിച്ചാലും."                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. AI Comparison Engine Architecture

When learners query comparison questions (e.g. *"What is the difference between 食べる and いただく?"*), the system triggers the structured lexical comparison contract:

```typescript
export interface LexicalComparisonResult {
  entryA: { id: string; headword: string; reading: string; register: RegisterLevel };
  entryB: { id: string; headword: string; reading: string; register: RegisterLevel };
  semanticOverlap: string;
  functionalDifference: string;
  speakerRelationship: string;
  usageContexts: Array<{
    scenario: string;
    correctWord: string;
    incorrectWord: string;
    explanation: string;
  }>;
  commonLearnerMistakes: string[];
  interchangeable: boolean;
  warningNotice: string;
}
```

### Safety & Guardrail Rules for AI Keigo Answers:
1. **Never Invert Hierarchy**: An AI response that suggests using *Sonkeigo* for self-actions or *Kenjougo* for superiors is strictly classified as a high-severity linguistic error.
2. **Explicit Grounding**: The AI must cite the registered `KeigoRelation` edge ID from the knowledge graph.
3. **Trilingual Clarification**: Explanations must clarify cultural context using natural Tamil (*உயர் மரியாதை* vs *பணிவுப் பிரயோகம்*) and Malayalam (*ആദരവ്* vs *വിനയം*) terminology alongside English.
