import assert from "node:assert/strict";
import test from "node:test";
import {
  orderedMapLimit,
  pipelineConcurrency,
} from "../src/pipeline/concurrency.mjs";

test("orderedMapLimit preserves input order while doing bounded parallel work", async () => {
  let active = 0;
  let peak = 0;
  const values = await orderedMapLimit([35, 5, 20, 1], 2, async (delay, index) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, delay));
    active -= 1;
    return `item-${index}`;
  });
  assert.deepEqual(values, ["item-0", "item-1", "item-2", "item-3"]);
  assert.equal(peak, 2);
});

test("pipeline concurrency overrides are validated and capped", () => {
  const previous = process.env.RIT_TEST_PIPELINE_CONCURRENCY;
  try {
    process.env.RIT_TEST_PIPELINE_CONCURRENCY = "99";
    assert.equal(
      pipelineConcurrency("RIT_TEST_PIPELINE_CONCURRENCY", {
        defaultValue: 3,
        maximum: 6,
      }),
      6,
    );
    process.env.RIT_TEST_PIPELINE_CONCURRENCY = "0";
    assert.equal(
      pipelineConcurrency("RIT_TEST_PIPELINE_CONCURRENCY", {
        defaultValue: 3,
        maximum: 6,
      }),
      1,
    );
    process.env.RIT_TEST_PIPELINE_CONCURRENCY = "not-a-number";
    assert.equal(
      pipelineConcurrency("RIT_TEST_PIPELINE_CONCURRENCY", {
        defaultValue: 3,
        maximum: 6,
      }),
      3,
    );
  } finally {
    if (previous === undefined) {
      delete process.env.RIT_TEST_PIPELINE_CONCURRENCY;
    } else {
      process.env.RIT_TEST_PIPELINE_CONCURRENCY = previous;
    }
  }
});
