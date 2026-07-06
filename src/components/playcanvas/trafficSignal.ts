import { Application, Color, Entity, StandardMaterial } from "playcanvas";
import {
  SIGNAL_LAMP_ORDER,
  SIGNAL_POST_POSITION,
  signalLampIntensity,
  type SignalState,
} from "@/lib/pcSignalView";

/**
 * The 3D traffic signal (replaces the P7 DOM widget). A Japanese-style
 * horizontal three-lamp head on a curbside post with an arm hanging the head
 * over the road, standing at the frozen `signal-1` stop line.
 *
 * The signal is pure VIEW: the driving screen's cycle effect stays the clock
 * (it writes `signalStateLogs`, which scoring replays), and the product scene
 * derives the lit lamp from the last log each frame (`pcSignalView`). Lamp
 * emissive keeps the DOM widget's 1 / 0.15 contrast, boosted by a constant
 * gain so the lit lamp reads as a light under the daytime sky.
 */

/** Emissive gain for the lamps (lit = 1 * GAIN, idle = 0.15 * GAIN). */
const LAMP_EMISSIVE_GAIN = 2.5;

const LAMP_COLORS: Record<SignalState, Color> = {
  green: new Color(0.05, 0.95, 0.35),
  yellow: new Color(1.0, 0.78, 0.08),
  red: new Color(1.0, 0.1, 0.08),
};

/** Head geometry: lamp spacing along the housing's local X. */
const LAMP_SPACING = 0.5;
const HEAD_HEIGHT = 4.6;
/** How far the arm hangs the head back over the road (toward x = 0). */
const ARM_REACH = 2.4;

export interface TrafficSignalHandle {
  /** Show/hide the whole signal (only the traffic-light lesson has one). */
  setVisible(visible: boolean): void;
  /** Light the lamp for `state`; null = no cycle running (all lamps idle). */
  setState(state: SignalState | null): void;
  dispose(): void;
}

export function createTrafficSignal(app: Application): TrafficSignalHandle {
  const root = new Entity("traffic-signal");
  const materials: StandardMaterial[] = [];

  const structureMat = new StandardMaterial();
  structureMat.useMetalness = true;
  structureMat.diffuse = new Color(0.35, 0.37, 0.38); // galvanized grey
  structureMat.metalness = 0.6;
  structureMat.gloss = 0.5;
  structureMat.update();
  materials.push(structureMat);

  // Post: curbside vertical pole.
  const post = new Entity("signal-post");
  post.addComponent("render", { type: "cylinder" });
  post.render!.material = structureMat;
  post.setLocalScale(0.22, HEAD_HEIGHT + 0.6, 0.22);
  post.setLocalPosition(0, (HEAD_HEIGHT + 0.6) / 2, 0);
  root.addChild(post);

  // Arm: horizontal, hanging the head over the road (toward x = 0, i.e. -X
  // from the post which stands at +X of the centreline).
  const arm = new Entity("signal-arm");
  arm.addComponent("render", { type: "cylinder" });
  arm.render!.material = structureMat;
  arm.setLocalScale(0.14, ARM_REACH, 0.14);
  arm.setLocalEulerAngles(0, 0, 90); // cylinder Y-axis -> X-axis
  arm.setLocalPosition(-ARM_REACH / 2, HEAD_HEIGHT + 0.45, 0);
  root.addChild(arm);

  // Housing: horizontal three-lamp box at the arm's end, facing +Z (the
  // approaching car drives toward -Z and sees this face).
  const housing = new Entity("signal-housing");
  housing.addComponent("render", { type: "box" });
  const housingMat = new StandardMaterial();
  housingMat.diffuse = new Color(0.07, 0.08, 0.09);
  housingMat.update();
  materials.push(housingMat);
  housing.render!.material = housingMat;
  housing.setLocalScale(LAMP_SPACING * 3 + 0.3, 0.62, 0.3);
  housing.setLocalPosition(-ARM_REACH, HEAD_HEIGHT, 0);
  root.addChild(housing);

  // Lamps: green-yellow-red, left to right FROM THE DRIVER'S VIEW. The driver
  // faces -Z, so their right is +X — red goes at +X (over the road centre
  // side), matching the Japanese convention of red nearest the road centre.
  const lampMats = new Map<SignalState, StandardMaterial>();
  SIGNAL_LAMP_ORDER.forEach((state, i) => {
    const lamp = new Entity(`signal-lamp-${state}`);
    lamp.addComponent("render", { type: "sphere" });
    const mat = new StandardMaterial();
    mat.diffuse = new Color(0.02, 0.02, 0.02);
    mat.emissive = LAMP_COLORS[state];
    mat.emissiveIntensity = signalLampIntensity(null, state) * LAMP_EMISSIVE_GAIN;
    mat.update();
    lamp.render!.material = mat;
    lampMats.set(state, mat);
    materials.push(mat);
    lamp.setLocalScale(0.38, 0.38, 0.2);
    lamp.setLocalPosition(-ARM_REACH + (i - 1) * LAMP_SPACING, HEAD_HEIGHT, 0.13);
    root.addChild(lamp);
  });

  root.setPosition(SIGNAL_POST_POSITION.x, 0, SIGNAL_POST_POSITION.z);
  root.enabled = false; // productDriveScene enables it for the traffic-light lesson
  app.root.addChild(root);

  let lastState: SignalState | null | undefined; // undefined = never set

  return {
    setVisible(visible) {
      if (root.enabled !== visible) root.enabled = visible;
    },
    setState(state) {
      if (state === lastState) return;
      lastState = state;
      for (const lampState of SIGNAL_LAMP_ORDER) {
        const mat = lampMats.get(lampState)!;
        mat.emissiveIntensity = signalLampIntensity(state, lampState) * LAMP_EMISSIVE_GAIN;
        mat.update();
      }
    },
    dispose() {
      root.destroy();
      for (const m of materials) m.destroy();
    },
  };
}
