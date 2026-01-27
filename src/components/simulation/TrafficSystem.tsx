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

  // 必要であれば currentLesson で分岐して配置を変えることも可能です
  
  return (
    <group>
      {/* === 交差点エリア === */}
      {/* 信号機（左側・手前） */}
      <TrafficLight position={[-6, 0, -30]} rotation={[0, Math.PI, 0]} />
      {/* 信号機（右側・奥） */}
      <TrafficLight position={[6, 0, -30]} rotation={[0, 0, 0]} />
      
      {/* 横断歩道 */}
      <Crosswalk position={[0, 0, -30]} width={12} length={3} />
      
      {/* 歩行者（横断歩道を往復） */}
      <Pedestrian startPos={[-8, 0, -30]} endPos={[8, 0, -30]} scale={2.5} speed={0.02} />

      {/* === 路上のオブジェクト === */}
      {/* 自転車（左側の路肩） */}
      <Bicycle position={[-5, 0, -15]} rotation={[0, 0.5, 0]} scale={0.4} color="#ef4444" />

      {/* === 新規: 踏切 === */}
      {/* 少し先の道路脇に配置 */}
      <RailroadCrossing position={[-7, 2, -60]} rotation={[0, 0.5, 0]} scale={6.0} />
    </group>
  );
}