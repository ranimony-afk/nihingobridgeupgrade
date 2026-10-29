import type { MindTreeMnemonicRecord } from "@/lib/kanji/mindtreeMnemonicContent";

const KANJIVG_REF = "https://github.com/KanjiVG/kanjivg/tree/r20240807/kanji";
const KANJIDIC2_REF = "upstream:kanjidic2:2023-08";
const CONTENT_REF = "ai-candidate:kanji-mindtree:m4";

function draft(
  character: string,
  keyword: string,
  componentCues: string[],
  story: string,
  readingHook: string | null = null,
): MindTreeMnemonicRecord {
  return {
    schemaVersion: "nihongobridge-kanji-mnemonic@2",
    id: `m4-ai-${(character.codePointAt(0) ?? 0).toString(16)}`,
    character,
    version: 1,
    keyword,
    componentCues,
    story,
    readingHook,
    origin: "ai_candidate",
    editorialStatus: "draft",
    provenanceRef: CONTENT_REF,
    sourceReferences: [KANJIVG_REF, KANJIDIC2_REF],
    interpretation: "memory-aid-not-etymology",
  };
}

/**
 * Agent-authored, unpublished content overlay. These are draft prompts for a
 * qualified human editor, not canonical data, verified decomposition, or
 * learner-facing copy. The upstream references identify visual/dictionary
 * context only; they do not source the invented stories.
 */
export const M4_AI_MNEMONIC_CANDIDATES: readonly MindTreeMnemonicRecord[] = [
  // Explicitly segregate the two strings revised with AI assistance in M2.
  {
    ...draft("男", "man", ["田", "力"], "Picture strength (力) moving through a rice field (田) to remember the two stacked shapes in 男."),
    id: "m4-ai-otoko",
    sourceReferences: ["first-party:kanji-mindtree:v1", "report:M2-VERTICAL-SLICE-IMPLEMENTATION-AND-VERIFICATION.md"],
  },
  {
    ...draft("箸", "chopsticks", ["竹", "者"], "Picture chopsticks beside a person as a cue for the bamboo-topped shape of 箸."),
    id: "m4-ai-hashi",
    sourceReferences: ["first-party:kanji-mindtree:v1", "report:M2-VERTICAL-SLICE-IMPLEMENTATION-AND-VERIFICATION.md"],
  },
  draft("一", "one", [], "Picture one clean stroke: one mark for one.", "ひとつ: imagine counting a single item."),
  draft("三", "three", ["一"], "Imagine three level marks lined up; count them once to remember three."),
  draft("上", "above", ["卜", "一"], "Use the small mark above the long line as a made-up height cue: above."),
  draft("下", "below", ["一", "卜"], "Use the small mark beneath the long line as a made-up position cue: below."),
  draft("中", "middle", ["口", "丨"], "Picture a line passing through the center of a box; the center is the middle."),
  draft("二", "two", [], "Picture two parallel strokes and count them: two."),
  draft("五", "five", ["二", "一"], "Imagine five tally marks arranged into this compact shape; the picture is only a memory hook."),
  draft("八", "eight", [], "Picture two strokes opening outward like a pair of diverging paths; let the shape cue eight."),
  draft("六", "six", ["亠", "八"], "Imagine a small roof-like top above two outward strokes; use that invented silhouette to recall six."),
  draft("円", "circle, yen", ["冂"], "Picture a rounded enclosure holding a coin; the enclosure is a visual cue for circle and yen."),
  draft("出", "go out", ["山", "丨", "凵"], "Imagine one shape emerging past another like a peak appearing beyond a ridge: go out."),
  draft("十", "ten", [], "Picture a cross-shaped meeting point where two groups of five meet: ten."),
  draft("千", "thousand", ["丿", "十"], "Imagine a tiny counting mark beside 十, then let the scene leap from ten to a thousand."),
  draft("口", "mouth", [], "Picture an open square as a little talking mouth; say the meaning aloud to lock in the cue."),
  draft("名", "name", ["夕", "口"], "Imagine someone calling a name aloud in the evening; the scene is a memory aid, not an origin story."),
  draft("四", "four", ["囗", "儿", "丿"], "Picture four corners around a small group of marks; count the corners to recall four."),
  draft("土", "soil", [], "Imagine a short sprout line above a broad ground line; picture soil beneath it."),
  draft("夕", "evening", [], "Picture a single curve of fading light at dusk; let the compact silhouette cue evening."),
  draft("大", "big", [], "Imagine a person stretching both arms wide to show something big; use the whole glyph as the pose."),
  draft("天", "sky", ["一", "大"], "Imagine a wide horizon above a person looking up; let the open space suggest sky."),
  draft("学", "study", ["⺍", "冖", "子"], "Picture a child beneath a shelter, gathering small ideas while studying; this is an invented scene."),
  draft("小", "small", [], "Imagine three tiny marks clustered together; let their small scale cue little or small."),
  draft("山", "mountain", [], "Picture three peaks on a ridge; the tallest central outline helps recall mountain."),
  draft("川", "river", [], "Imagine three flowing currents side by side; let the parallel strokes cue a river."),
  draft("左", "left", ["工"], "Imagine a small workshop sign held on your left; use the whole silhouette as a direction cue."),
  draft("年", "year", ["丿", "干", "十"], "Picture a calendar page turning after a long count; the unusual glyph is a visual tag for year."),
  draft("日", "sun, day", [], "Imagine a bright window framing the sun at noon; use the enclosed shape to recall day."),
  draft("早", "early", ["日", "十"], "Picture the sun already above the horizon while a clock is still near ten: early."),
  draft("月", "moon, month", [], "Picture a slim moon framed by two inner marks; use the curved outline to remember moon."),
  draft("木", "tree, wood", [], "Imagine the central stroke as a trunk and the side strokes as branches; picture a tree."),
  draft("本", "book, origin", ["木", "丨"], "Imagine a bookmark line at the base of a tree-shaped page; use that mark to recall a book or starting point."),
  draft("村", "village", ["木", "寸"], "Picture a few homes gathered around a tree in a village; the scene is only a recall cue."),
  draft("水", "water", [], "Imagine four quick splashes surrounding a flowing center; picture water moving outward."),
  draft("火", "fire", [], "Imagine two sparks lifting from a small flame; let the whole shape cue fire."),
  draft("犬", "dog", ["大", "丶"], "Picture a big friendly dog with one bright nose mark; use that playful image to recall dog."),
  draft("田", "rice field", [], "Imagine a field divided into four small plots; count the plots to picture a rice field."),
  draft("白", "white", ["日"], "Picture a bright white flash above a small window; the image is a made-up cue for white."),
  draft("石", "stone", ["口"], "Imagine a solid stone resting beside a square marker; use the compact outline to remember stone."),
  draft("空", "sky, empty", ["穴", "宀", "冖", "八"], "Picture an open space under a roof, with nothing stored there; let the scene cue empty or sky."),
  draft("竹", "bamboo", [], "Imagine two slender bamboo stalks with small leaves at their tips; let the paired shape recall bamboo."),
  draft("足", "foot, leg", ["口", "龰"], "Picture a footprint stepping forward from a small square marker; use the motion to recall foot."),
  draft("車", "car, vehicle", [], "Imagine a wheeled vehicle viewed from above, with a central body and balanced sides; use it to recall car."),
];
