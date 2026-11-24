---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round, give your recommended answer to each, then wait for the user's answers before the next round.

**Ask every round through the pop-out** (Albert, 2026-11-24: "pop out please... for all grill me questions"):

- Use the **AskUserQuestion** tool, one question per frontier decision, at most 4 questions per call. A bigger frontier goes in back-to-back calls in the same round.
- Each question stands on its own: the pop-out may hide everything you wrote before it, so name the items you're asking about and state, in a line, any fact the question depends on.
- `header` is at most 12 characters. Give 2 to 4 options. Put your recommended answer **first**, end its label with "(Recommended)", and say why in its description. Don't add an "Other" option; the tool adds one.
- If the user answers in chat instead of in the pop-out, their message is the answer. Read it as such.
- **Never re-ask a question the user has answered.** If a restart or a lost tool result drops answers, recover them from the conversation. If they are truly gone, say so plainly and ask only the lost ones, once.
- Only when AskUserQuestion isn't available, fall back to text, one block per question:

```
❓ **Q1** - **<question title>**: <question body, including the choices>

➡️ <your recommended answer>
```

Word each question so accepting the first option accepts your recommendation.

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one. When two answers conflict, the next round asks which one wins before building on either.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent with a fresh context window to find it; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.
