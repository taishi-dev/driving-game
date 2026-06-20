"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Text } from "@react-three/drei";
import Link from "next/link";

// 作成した各オブジェクトをインポート
// ※パスは実際のファイル構成に合わせてください
import { TrafficLight } from "@/components/simulation/objects/TrafficLight";
import { Pedestrian } from "@/components/simulation/objects/Pedestrian";
import { Crosswalk } from "@/components/simulation/objects/Crosswalk";
import { Bicycle } from "@/components/simulation/objects/Bicycle";
import { RailroadCrossing } from "@/components/simulation/objects/RailroadCrossing";

export default function DebugPage() {
  return (
    <div style={{ width: "100%", height: "100vh", backgroundColor: "#1e1e1e" }}>
      {/* 戻るボタン */}
      <div style={{ position: "absolute", top: 20, left: 20, zIndex: 10 }}>
        <Link href="/" style={{ 
          padding: "10px 20px", 
          backgroundColor: "white", 
          borderRadius: "5px",
          textDecoration: "none",
          fontWeight: "bold"
        }}>
          ← HOMEに戻る
        </Link>
      </div>

      <div style={{ position: "absolute", top: 20, right: 20, zIndex: 10, color: "white", textAlign: "right" }}>
        <h1 style={{ margin: 0 }}>3D Model Viewer</h1>
        <p style={{ margin: 0, opacity: 0.7 }}>マウス操作: 回転(左ドラッグ) / 移動(右ドラッグ) / 拡大(ホイール)</p>
      </div>

      <Canvas camera={{ position: [0, 5, 10], fov: 50 }}>
        {/* カメラ操作用 */}
        <OrbitControls makeDefault />

        {/* 照明 */}
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />

        {/* 床のグリッド */}
        <Grid infiniteGrid fadeDistance={50} sectionColor="#444" cellColor="#222" />

        {/* === モデルを並べて配置 === */}

        {/* 1. 信号機 */}
        <group position={[-6, 0, 0]}>
          <Label text="Traffic Light" />
          <TrafficLight position={[0, 0, 0]} />
        </group>

        {/* 2. 歩行者 */}
        <group position={[-2, 0, 0]}>
          <Label text="Pedestrian" />
          <Pedestrian startPos={[0, 0, -2]} endPos={[0, 0, 2]} speed={0.05} />
        </group>

        {/* 3. 自転車 */}
        <group position={[2, 0, 0]}>
          <Label text="Bicycle" />
          <Bicycle position={[0, 0, 0]} rotation={[0, 0.5, 0]} scale={1.2} color="#ef4444" />
        </group>

        {/* 4. 踏切 */}
        <group position={[6, 0, 0]}>
          <Label text="Railroad Crossing" />
          <RailroadCrossing position={[0, 0, 0]} scale={4.0}/>
        </group>

        {/* 5. 横断歩道 (手前に配置) */}
        <group position={[0, 0, 5]}>
          <Label text="Crosswalk" position={[0, 1, 0]} />
          <Crosswalk position={[0, 0, 0]} width={10} length={3} />
        </group>

      </Canvas>
    </div>
  );
}

// モデルの上に文字を表示するヘルパーコンポーネント
function Label({ text, position = [0, 4, 0] }: { text: string, position?: [number, number, number] }) {
  return (
    <Text
      position={position as [number, number, number]}
      fontSize={0.5}
      color="white"
      anchorX="center"
      anchorY="middle"
      outlineWidth={0.05}
      outlineColor="black"
    >
      {text}
    </Text>
  );

}