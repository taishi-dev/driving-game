import { test } from "node:test";
import assert from "node:assert/strict";

import {
  currentSignalState,
  signalLampIntensity,
  SIGNAL_POST_POSITION,
  SIGNAL_LAMP_ORDER,
} from "../src/lib/pcSignalView.ts";
import { MISSION_CHECKPOINTS } from "../src/lib/mission/missions.ts";

test("currentSignalState is the LAST log's state, or null when empty", () => {
  assert.equal(currentSignalState([]), null);
  assert.equal(
    currentSignalState([{ time: 1, checkpointId: "signal-1", state: "green" }]),
    "green",
  );
  assert.equal(
    currentSignalState([
      { time: 1, checkpointId: "signal-1", state: "green" },
      { time: 2, checkpointId: "signal-1", state: "yellow" },
      { time: 3, checkpointId: "signal-1", state: "red" },
    ]),
    "red",
  );
});

test("only the active lamp is lit; the rest idle dim (DOM-widget semantics)", () => {
  // The DOM widget rendered active at opacity 1, inactive at 0.15 — the 3D
  // lamps keep the same contrast so red-vs-idle stays unambiguous.
  assert.equal(signalLampIntensity("red", "red"), 1);
  assert.equal(signalLampIntensity("red", "yellow"), 0.15);
  assert.equal(signalLampIntensity("red", "green"), 0.15);
  assert.equal(signalLampIntensity("green", "green"), 1);
  // No cycle running (lesson without a signal): everything idle.
  assert.equal(signalLampIntensity(null, "red"), 0.15);
});

test("lamp order matches the Japanese horizontal housing (green-yellow-red, left to right)", () => {
  assert.deepEqual(SIGNAL_LAMP_ORDER, ["green", "yellow", "red"]);
});

test("the post stands at the signal-1 stop line, clear of the road", () => {
  const checkpoints = MISSION_CHECKPOINTS["traffic-light"] ?? [];
  const signalCp = checkpoints.find((c) => c.id === "signal-1");
  assert.ok(signalCp, "signal-1 checkpoint must exist");
  // Same stop-line Z as the frozen checkpoint...
  assert.equal(SIGNAL_POST_POSITION.z, signalCp!.position[2]);
  // ...and laterally outside the checkpoint trigger radius so the post never
  // reads as being ON the driving line (car approaches along x=0).
  assert.ok(Math.abs(SIGNAL_POST_POSITION.x) >= signalCp!.radius);
});
