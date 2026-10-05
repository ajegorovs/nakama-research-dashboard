/**
 * Source UI test — the shared activity line's actor-attribution decision.
 *
 * This pins the ONE fact the rendered-provenance correction turns on: the attribution a row shows comes
 * from the recorded actor kind, never from the event's source type. A github PR/commit is not `system`
 * because it is a github event; it is `system` only when the store recorded the actor as a system actor.
 *
 * The decision is exercised through the exported `activityActorIndication` — the same function the
 * `ActivityLine` component calls — so a regression in the component's branch selection fails here without a
 * DOM. The DOM/screenshot half of the evidence lives with the offline render capture.
 */
import { describe, expect, test } from "bun:test";
import { activityActorIndication } from "./ui";

describe("activity actor indication", () => {
  test("a mapped person is a person, whatever the actor kind", () => {
    expect(activityActorIndication("human", true)).toBe("person");
    expect(activityActorIndication("agent", true)).toBe("person");
    expect(activityActorIndication("system", true)).toBe("person");
    expect(activityActorIndication("unknown", true)).toBe("person");
  });

  test("a recorded system actor is stated as system, not as 'no account attributed'", () => {
    expect(activityActorIndication("system", false)).toBe("system");
  });

  test("an unmapped human/agent/unknown is unattributed (never system)", () => {
    expect(activityActorIndication("human", false)).toBe("unattributed");
    expect(activityActorIndication("agent", false)).toBe("unattributed");
    expect(activityActorIndication("unknown", false)).toBe("unattributed");
    expect(activityActorIndication("", false)).toBe("unattributed");
  });

  test("the source type is not an input to the decision", () => {
    // Source type can never reach the decision: the function takes exactly (actorType, hasPerson).
    expect(activityActorIndication.length).toBe(2);
  });
});
