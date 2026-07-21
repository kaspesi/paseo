import type { StreamLayoutItem } from "./layout";

// react-native-web renders `dataSet={{ promptanchor: id }}` as `data-promptanchor="<id>"`.
// The key stays a single lowercase word so the attribute name is stable across
// react-native-web's camelCase -> kebab-case conversion.
export const PROMPT_ANCHOR_ATTRIBUTE = "data-promptanchor";

export function buildPromptAnchorDataSet(id: string): Record<string, string> {
  return { promptanchor: id };
}

// A scroll lands the anchor exactly at scrollTop, so the next click in the same
// direction must not resolve to the anchor it just landed on. Sub-pixel layout
// drift also has to fall inside this window.
const PROMPT_ANCHOR_EPSILON_PX = 8;

export type PromptScrollDirection = "previous" | "next";

export interface PromptAnchorOffset {
  id: string;
  /** Offset of the anchor's top edge within the scroll container's content. */
  offset: number;
}

export type PromptScrollTarget =
  | { kind: "anchor"; id: string; offset: number }
  | { kind: "bottom" }
  | { kind: "none" };

/**
 * Ids of the user prompts the navigator steps between, in render order. Only the
 * first message of a consecutive user-message run is an anchor, so a prompt sent
 * as several queued messages is one stop rather than several.
 *
 * Render order equals chronological order on web, which is the only platform
 * that renders the navigator. The native stream renders history newest-first, so
 * this list would come back reversed there.
 */
export function collectPromptAnchorIds(input: {
  history: StreamLayoutItem[];
  liveHead: StreamLayoutItem[];
}): string[] {
  const ids: string[] = [];
  for (const layoutItem of input.history) {
    if (layoutItem.isFirstInUserGroup) {
      ids.push(layoutItem.item.id);
    }
  }
  for (const layoutItem of input.liveHead) {
    if (layoutItem.isFirstInUserGroup) {
      ids.push(layoutItem.item.id);
    }
  }
  return ids;
}

/**
 * Resolve where a previous/next click should land, from the live scroll position
 * rather than a remembered cursor. Recomputing every click means the control
 * stays correct when the reader scrolls by hand or the stream grows underneath
 * them, with no cursor to invalidate.
 *
 * `anchors` must be ordered by ascending offset (render order does this).
 */
export function resolvePromptScrollTarget(input: {
  anchors: PromptAnchorOffset[];
  scrollTop: number;
  direction: PromptScrollDirection;
}): PromptScrollTarget {
  if (input.direction === "previous") {
    for (let index = input.anchors.length - 1; index >= 0; index -= 1) {
      const anchor = input.anchors[index];
      if (anchor.offset < input.scrollTop - PROMPT_ANCHOR_EPSILON_PX) {
        return { kind: "anchor", id: anchor.id, offset: anchor.offset };
      }
    }
    return { kind: "none" };
  }

  for (const anchor of input.anchors) {
    if (anchor.offset > input.scrollTop + PROMPT_ANCHOR_EPSILON_PX) {
      return { kind: "anchor", id: anchor.id, offset: anchor.offset };
    }
  }
  return { kind: "bottom" };
}
