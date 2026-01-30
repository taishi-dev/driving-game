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

  // 横断歩道レベルかどうか
  const isCrosswalkLevel = currentLesson === "crosswalk";
  const isRailroadLevel = currentLesson === "railroad-crossing" || currentLesson === "free-mode";

  return (
    <group>
      {/* === 交差点エリア === */}
      {/* 信号機（常時表示、または traffic-light レベルのみにするなど調整可） */}
      <TrafficLight position={[-6, 0, -30]} rotation={[0, Math.PI, 0]} />
      <TrafficLight position={[6, 0, -30]} rotation={[0, 0, 0]} />
      
      {/* ✅ 変更: 横断歩道と歩行者は 'crosswalk' レベルのみ表示 */}
      {isCrosswalkLevel && (
        <>
          <Crosswalk position={[0, 0, -30]} width={12} length={3} />
          <Pedestrian startPos={[-8, 0, -30]} endPos={[8, 0, -30]} scale={2.5} speed={0.02} />
        </>
      )}

      {/* === 路上のオブジェクト === */}
      {/* 自転車 */}
      <Bicycle position={[-5, 0, -15]} rotation={[0, 0.5, 0]} scale={0.4} color="#ef4444" />

      {/* 踏切 */}
      {isRailroadLevel && (
        <RailroadCrossing position={[-7, 2, -60]} rotation={[0, 0.5, 0]} scale={6.0} />
      )}
    </group>
  );
}