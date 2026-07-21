import { describe, expect, it } from "vitest";
import type { StreamItem } from "@/types/stream";
import type { StreamLayoutItem } from "./layout";
import {
  collectPromptAnchorIds,
  resolvePromptScrollTarget,
  type PromptAnchorOffset,
} from "./prompt-anchor";

function streamItem(id: string, kind: StreamItem["kind"]): StreamItem {
  if (kind === "user_message") {
    return { kind: "user_message", id, text: id, timestamp: new Date(0) };
  }
  return { kind: "assistant_message", id, text: id, timestamp: new Date(0) };
}

function layoutItem(id: string, kind: StreamItem["kind"], isFirstInUserGroup: boolean) {
  return {
    item: streamItem(id, kind),
    isFirstInUserGroup,
  } as StreamLayoutItem;
}

function anchors(...offsets: number[]): PromptAnchorOffset[] {
  return offsets.map((offset, index) => ({ id: `prompt-${index}`, offset }));
}

describe("collectPromptAnchorIds", () => {
  it("keeps only the opening message of each user run, history before live head", () => {
    const ids = collectPromptAnchorIds({
      history: [
        layoutItem("u1", "user_message", true),
        layoutItem("u1b", "user_message", false),
        layoutItem("a1", "assistant_message", false),
        layoutItem("u2", "user_message", true),
      ],
      liveHead: [
        layoutItem("u3", "user_message", true),
        layoutItem("a2", "assistant_message", false),
      ],
    });

    expect(ids).toEqual(["u1", "u2", "u3"]);
  });

  it("returns nothing when the stream has no user messages", () => {
    expect(
      collectPromptAnchorIds({
        history: [layoutItem("a1", "assistant_message", false)],
        liveHead: [],
      }),
    ).toEqual([]);
  });
});

describe("resolvePromptScrollTarget", () => {
  it("steps up through prompts on repeated previous scrolls", () => {
    const promptAnchors = anchors(0, 400, 900);

    const first = resolvePromptScrollTarget({
      anchors: promptAnchors,
      scrollTop: 1500,
      direction: "previous",
    });
    expect(first).toEqual({ kind: "anchor", id: "prompt-2", offset: 900 });

    const second = resolvePromptScrollTarget({
      anchors: promptAnchors,
      scrollTop: 900,
      direction: "previous",
    });
    expect(second).toEqual({ kind: "anchor", id: "prompt-1", offset: 400 });

    const third = resolvePromptScrollTarget({
      anchors: promptAnchors,
      scrollTop: 400,
      direction: "previous",
    });
    expect(third).toEqual({ kind: "anchor", id: "prompt-0", offset: 0 });
  });

  it("does nothing when there is no prompt above the viewport", () => {
    expect(
      resolvePromptScrollTarget({
        anchors: anchors(0, 400),
        scrollTop: 0,
        direction: "previous",
      }),
    ).toEqual({ kind: "none" });
  });

  it("ignores sub-pixel drift so a landed anchor is not re-selected", () => {
    expect(
      resolvePromptScrollTarget({
        anchors: anchors(0, 400),
        scrollTop: 400.5,
        direction: "previous",
      }),
    ).toEqual({ kind: "anchor", id: "prompt-0", offset: 0 });

    expect(
      resolvePromptScrollTarget({
        anchors: anchors(0, 400),
        scrollTop: 399.5,
        direction: "next",
      }),
    ).toEqual({ kind: "bottom" });
  });

  it("steps down to the next prompt below the viewport", () => {
    expect(
      resolvePromptScrollTarget({
        anchors: anchors(0, 400, 900),
        scrollTop: 0,
        direction: "next",
      }),
    ).toEqual({ kind: "anchor", id: "prompt-1", offset: 400 });
  });

  it("falls through to the bottom once past the newest prompt", () => {
    expect(
      resolvePromptScrollTarget({
        anchors: anchors(0, 400, 900),
        scrollTop: 900,
        direction: "next",
      }),
    ).toEqual({ kind: "bottom" });
  });

  it("treats an empty stream as nothing above and the bottom below", () => {
    expect(resolvePromptScrollTarget({ anchors: [], scrollTop: 0, direction: "previous" })).toEqual(
      {
        kind: "none",
      },
    );
    expect(resolvePromptScrollTarget({ anchors: [], scrollTop: 0, direction: "next" })).toEqual({
      kind: "bottom",
    });
  });
});
