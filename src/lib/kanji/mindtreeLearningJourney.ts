export const MINDTREE_JOURNEY_STAGES = ["Observe", "Break down", "Associate", "Remember", "Recall", "Explore"] as const;
export type MindTreeJourneyStage = (typeof MINDTREE_JOURNEY_STAGES)[number];
export type MindTreeRecallMode = "meaning" | "components";

/** Preserve source context when a learner follows a bounded neighborhood link. */
export function mindTreeExploreHref(from: string, to: string, via: string): string {
  const query = new URLSearchParams({ from, via });
  return `/mindtree/${encodeURIComponent(to)}?${query.toString()}`;
}

export interface MindTreeJourneyState {
  stage: MindTreeJourneyStage;
  revealedStoryParts: number;
  storyVisible: boolean;
  recallMode: MindTreeRecallMode;
  answerVisible: boolean;
  selfCheck: "recalled" | "review" | null;
}

export type MindTreeJourneyAction =
  | { type: "set-stage"; stage: MindTreeJourneyStage }
  | { type: "advance-stage" }
  | { type: "reveal-next-story-part"; partCount: number }
  | { type: "toggle-story"; visible: boolean }
  | { type: "set-recall-mode"; mode: MindTreeRecallMode }
  | { type: "reveal-answer" }
  | { type: "hide-answer" }
  | { type: "self-check"; result: "recalled" | "review" };

export const INITIAL_MINDTREE_JOURNEY_STATE: MindTreeJourneyState = {
  stage: "Observe",
  revealedStoryParts: 0,
  storyVisible: false,
  recallMode: "meaning",
  answerVisible: false,
  selfCheck: null,
};

export function segmentMnemonicStory(text: string): string[] {
  const segments = text.split(/(?<=[.!?。！？])\s+/u).map((part) => part.trim()).filter(Boolean);
  return segments.length ? segments : text.trim() ? [text.trim()] : [];
}

export function mindTreeJourneyReducer(
  state: MindTreeJourneyState,
  action: MindTreeJourneyAction,
): MindTreeJourneyState {
  switch (action.type) {
    case "set-stage":
      return { ...state, stage: action.stage };
    case "advance-stage": {
      const index = MINDTREE_JOURNEY_STAGES.indexOf(state.stage);
      return index >= MINDTREE_JOURNEY_STAGES.length - 1
        ? state
        : { ...state, stage: MINDTREE_JOURNEY_STAGES[index + 1] };
    }
    case "reveal-next-story-part":
      return { ...state, revealedStoryParts: Math.min(Math.max(0, action.partCount), state.revealedStoryParts + 1) };
    case "toggle-story":
      return { ...state, storyVisible: action.visible };
    case "set-recall-mode":
      return { ...state, recallMode: action.mode, answerVisible: false, selfCheck: null };
    case "reveal-answer":
      return { ...state, answerVisible: true };
    case "hide-answer":
      return { ...state, answerVisible: false };
    case "self-check":
      return { ...state, selfCheck: action.result };
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
