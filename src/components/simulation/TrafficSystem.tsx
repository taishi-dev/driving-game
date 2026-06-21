"use client";

import { useDrivingStore } from "@/lib/store";

// Import individually from the objects folder
import { TrafficLight } from "./objects/TrafficLight";
import { Pedestrian } from "./objects/Pedestrian";
import { Crosswalk } from "./objects/Crosswalk";
import { Bicycle } from "./objects/Bicycle";
import { RailroadCrossing } from "./objects/RailroadCrossing";

export function TrafficSystem() {
  const currentLesson = useDrivingStore(state => state.currentLesson);

  // Condition for showing the traffic light: level 6 (traffic-light) or free mode
  const showTrafficLight = currentLesson === "traffic-light" || currentLesson === "free-mode";

  // Condition for showing the crosswalk: level 7 (crosswalk) or free mode
  const showCrosswalk = currentLesson === "crosswalk" || currentLesson === "free-mode";

  // Condition for showing the railroad crossing: level 8 (railroad-crossing) or free mode
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