import { test, expect, type Page } from "./fixtures";
import { openAgentTimeline, seedLongMockAgentTimeline } from "./helpers/timeline-pagination";

const PROMPT_TURN_PATTERN = /timeline-pagination-turn-(\d+)/;

/**
 * Turn index of the prompt currently pinned to the top of the viewport. A scroll
 * lands the anchor exactly at the scroll container's top edge, so the pinned
 * prompt is the one whose anchor sits at offset ~0.
 */
async function readPinnedPromptTurn(page: Page): Promise<number | null> {
  const text = await page.evaluate(() => {
    const scroll = document.querySelector('[data-testid="agent-chat-scroll"]');
    if (!(scroll instanceof HTMLElement)) {
      return null;
    }
    const containerTop = scroll.getBoundingClientRect().top;
    for (const node of scroll.querySelectorAll("[data-promptanchor]")) {
      if (Math.abs(node.getBoundingClientRect().top - containerTop) <= 2) {
        return node.textContent;
      }
    }
    return null;
  });
  const match = text?.match(PROMPT_TURN_PATTERN);
  return match ? Number(match[1]) : null;
}

function readScrollTop(page: Page): Promise<number> {
  return page.evaluate(() => {
    const scroll = document.querySelector('[data-testid="agent-chat-scroll"]');
    return scroll instanceof HTMLElement ? scroll.scrollTop : 0;
  });
}

function readDistanceFromBottom(page: Page): Promise<number> {
  return page.evaluate(() => {
    const scroll = document.querySelector('[data-testid="agent-chat-scroll"]');
    if (!(scroll instanceof HTMLElement)) {
      return Number.POSITIVE_INFINITY;
    }
    return scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop;
  });
}

async function scrollAndReadPinnedTurn(
  page: Page,
  direction: "previous" | "next",
): Promise<number> {
  await page.getByTestId(`scroll-to-${direction}-prompt-button`).click();
  await expect.poll(() => readPinnedPromptTurn(page), { timeout: 10_000 }).not.toBeNull();
  const turn = await readPinnedPromptTurn(page);
  if (turn === null) {
    throw new Error(
      `No prompt pinned to the viewport top after scrolling to the ${direction} prompt`,
    );
  }
  return turn;
}

test.describe("Agent stream prompt navigator", () => {
  test("steps the viewport between user prompts in both directions", async ({ page }) => {
    test.setTimeout(180_000);
    const agent = await seedLongMockAgentTimeline({ turns: 12 });
    try {
      await openAgentTimeline(page, agent);
      await expect(page.getByText(agent.newestPrompt, { exact: true })).toBeVisible({
        timeout: 30_000,
      });

      const previousButton = page.getByTestId("scroll-to-previous-prompt-button");
      await expect(previousButton).toBeVisible();

      // The newest prompt can sit inside the final viewport, where the scroll
      // position clamps before it reaches the top edge. Take that first step
      // untracked so the assertions below start from a prompt that can pin.
      await previousButton.click();

      const firstTurn = await scrollAndReadPinnedTurn(page, "previous");
      const secondTurn = await scrollAndReadPinnedTurn(page, "previous");
      expect(secondTurn).toBe(firstTurn - 1);

      const backTurn = await scrollAndReadPinnedTurn(page, "next");
      expect(backTurn).toBe(firstTurn);
    } finally {
      await agent.cleanup();
    }
  });

  test("returns to the live bottom when stepping past the newest prompt", async ({ page }) => {
    test.setTimeout(180_000);
    const agent = await seedLongMockAgentTimeline({ turns: 6 });
    try {
      await openAgentTimeline(page, agent);
      await expect(page.getByText(agent.newestPrompt, { exact: true })).toBeVisible({
        timeout: 30_000,
      });

      await page.getByTestId("scroll-to-previous-prompt-button").click();
      await page.getByTestId("scroll-to-previous-prompt-button").click();
      await expect.poll(() => readScrollTop(page)).toBeGreaterThan(0);

      const nextButton = page.getByTestId("scroll-to-next-prompt-button");
      await nextButton.click();
      await nextButton.click();
      await nextButton.click();

      await expect.poll(() => readDistanceFromBottom(page)).toBeLessThanOrEqual(2);
    } finally {
      await agent.cleanup();
    }
  });
});
