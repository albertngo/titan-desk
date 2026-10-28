import { describe, expect, it } from "vitest";
import { keyProblem } from "../src/lib/anthropic/key";

/* Invented keys only: none of these is or was a real key. */

const GOOD = `sk-ant-api03-${"Ab3_-x".repeat(8)}`;

describe("the reading key", () => {
  it("accepts an API key, with or without stray spaces around it", () => {
    expect(keyProblem(GOOD)).toBeNull();
    expect(keyProblem(`  ${GOOD}\n`)).toBeNull();
  });

  it("refuses a pasted command, a key with spaces inside, and a token that isn't an API key, never repeating the value", () => {
    const pasted = `curl https://api.example.com/v1/messages \\\n --header "x-api-key: ${GOOD}"`;
    const cases = [pasted, `${GOOD.slice(0, 20)} ${GOOD.slice(20)}`, `sk-ant-usr-${"Zz9".repeat(10)}`, "hello"];
    for (const v of cases) {
      const why = keyProblem(v);
      expect(why).not.toBeNull();
      expect(why).not.toContain(GOOD.slice(13, 25));
      expect(why).not.toContain("Zz9Zz9");
    }
    expect(keyProblem(pasted)).toMatch(/pasted command/);
    expect(keyProblem(`sk-ant-usr-${"Zz9".repeat(10)}`)).toMatch(/isn't an API key/);
  });
});
