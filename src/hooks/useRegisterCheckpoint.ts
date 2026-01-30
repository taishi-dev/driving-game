import { useEffect, useRef } from 'react';
import { useDrivingStore, MissionCheckpoint } from '@/lib/store';

// IDは自動生成するので、ID以外の情報を渡せばOKにします
type CheckpointProps = Omit<MissionCheckpoint, 'id'>;

export function useRegisterCheckpoint(checkpointData: CheckpointProps) {
  const register = useDrivingStore((state) => state.registerCheckpoint);
  const unregister = useDrivingStore((state) => state.unregisterCheckpoint);
  
  // コンポーネントごとにユニークなIDを生成
  const id = useRef(`cp_${Math.random().toString(36).substr(2, 9)}`).current;

  useEffect(() => {
    // マウント時にチェックポイントを登録
    register({ ...checkpointData, id });

    // アンマウント時に削除
    return () => {
      unregister(id);
    };
    // 位置やタイプが変わったら再登録
  }, [
      checkpointData.position[0], 
      checkpointData.position[2], 
      checkpointData.type, 
      register, 
      unregister, 
      id
  ]);
}