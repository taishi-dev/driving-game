"use client";

import { useDrivingStore } from "@/lib/store";

// objectsフォルダから個別にインポート
import { TrafficLight } from "./objects/TrafficLight";
import { Pedestrian } from "./objects/Pedestrian";
import { Crosswalk } from "./objects/Crosswalk";
import { Bicycle } from "./objects/Bicycle";
import { RailroadCrossing } from "./objects/RailroadCrossing";

export function TrafficSystem() {
  const currentLesson = useDrivingStore(state => state.currentLesson);

  // 信号機を表示する条件: レベル6(traffic-light) または フリーモード
  const showTrafficLight = currentLesson === "traffic-light" || currentLesson === "free-mode";

  // 横断歩道を表示する条件: レベル7(crosswalk) または フリーモード
  const showCrosswalk = currentLesson === "crosswalk" || currentLesson === "free-mode";

  // 踏切を表示する条件: レベル8(railroad-crossing) または フリーモード
  const showRailroad = currentLesson === "railroad-crossing" || currentLesson === "free-mode";

  return (
    <group>
      
      {showTrafficLight && (
        <>
          <TrafficLight position={[-6, 0, -30]} rotation={[0, Math.PI, 0]} />
          <TrafficLight position={[6, 0, -30]} rotation={[0, 0, 0]} />
        </>
      )}
            {showCrosswalk && (
        <>
          <Crosswalk position={[0, 0, -30]} width={12} length={3} />
          <Pedestrian startPos={[-8, 0, -30]} endPos={[8, 0, -30]} scale={2.5} speed={0.02} />
          <Bicycle position={[-7, 1, -30]} rotation={[0, 0.5, 0]} scale={2.0} color="#ef4444" />
        </>
      )}
            {showRailroad && (
        <RailroadCrossing position={[-7, 2, -60]} rotation={[0, 0.5, 0]} scale={6.0} />
      )}
    </group>
  );
}