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

  // ▼▼▼ ここで表示するかどうかの判定を作る ▼▼▼
  
  // 横断歩道を表示する条件: レベル7(crosswalk) または フリーモード
  const showCrosswalk = currentLesson === "crosswalk" || currentLesson === "free-mode";

  // 踏切を表示する条件: レベル8(railroad-crossing) または フリーモード
  const showRailroad = currentLesson === "railroad-crossing" || currentLesson === "free-mode";

  return (
    <group>
      {/* === 交差点エリア === */}
      {/* 信号機はとりあえず常時表示（必要ならここも条件分岐できます） */}
      <TrafficLight position={[-6, 0, -30]} rotation={[0, Math.PI, 0]} />
      <TrafficLight position={[6, 0, -30]} rotation={[0, 0, 0]} />
      
      {/* ▼▼▼ 条件付きで表示 (showCrosswalkが true の時だけ表示) ▼▼▼ */}
      {showCrosswalk && (
        <>
          <Crosswalk position={[0, 0, -30]} width={12} length={3} />
          <Pedestrian startPos={[-8, 0, -30]} endPos={[8, 0, -30]} scale={2.5} speed={0.02} />
        </>
      )}

      {/* === 路上のオブジェクト === */}
      {/* 自転車（これは常時表示でOKならそのまま） */}
      <Bicycle position={[-5, 0, -15]} rotation={[0, 0.5, 0]} scale={0.4} color="#ef4444" />

      {/* ▼▼▼ 条件付きで表示 (showRailroadが true の時だけ表示) ▼▼▼ */}
      {showRailroad && (
        <RailroadCrossing position={[-7, 2, -60]} rotation={[0, 0.5, 0]} scale={6.0} />
      )}
    </group>
  );
}