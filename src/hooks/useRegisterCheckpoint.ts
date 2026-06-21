import { useEffect, useId } from 'react';
import { useDrivingStore, MissionCheckpoint } from '@/lib/store';

// The ID is auto-generated, so passing the non-ID information is enough
type CheckpointProps = Omit<MissionCheckpoint, 'id'>;

export function useRegisterCheckpoint(checkpointData: CheckpointProps) {
  const register = useDrivingStore((state) => state.registerCheckpoint);
  const unregister = useDrivingStore((state) => state.unregisterCheckpoint);
  
  // Stable unique ID per component instance (pure; replaces Math.random()).
  const id = useId();

  useEffect(() => {
    // Register the checkpoint on mount
    register({ ...checkpointData, id });

    // Remove it on unmount
    return () => {
      unregister(id);
    };
    // Re-register when the position or type changes
  }, [
      checkpointData.position[0], 
      checkpointData.position[2], 
      checkpointData.type, 
      register, 
      unregister, 
      id
  ]);
}