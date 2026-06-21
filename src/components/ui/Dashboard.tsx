"use client";

import { useDrivingStore } from "@/lib/store";

export function Dashboard() {
  const isOffTrack = useDrivingStore(state => state.isOffTrack);
  
  // Added: get the message from the store
  const drivingFeedback = useDrivingStore(state => state.drivingFeedback);

  return (
    <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        userSelect: 'none',
        fontFamily: "'Segoe UI', Roboto, sans-serif",
        overflow: 'hidden',
        zIndex: 50
    }}>
      
      {/* Added: display area for scoring feedback (OK messages)
        Shown in green at the top center of the screen.
      */}
      {drivingFeedback && (
          <div style={{
              position: 'absolute',
              top: '20%',
              left: '50%',
              transform: 'translateX(-50%)',
              textAlign: 'center',
              zIndex: 100,
              animation: 'popIn 0.3s ease-out forwards'
          }}>
              <div style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  border: '2px solid #4ade80', // bright green
                  borderRadius: '12px',
                  padding: '16px 32px',
                  color: '#4ade80',
                  fontSize: '24px',
                  fontWeight: 'bold',
                  boxShadow: '0 0 20px rgba(74, 222, 128, 0.3)',
                  whiteSpace: 'nowrap'
              }}>
                  {drivingFeedback}
              </div>
          </div>
      )}

      {/* Warning Overlay (off-track warning) */}
      {isOffTrack && (
          <div style={{
              position: 'absolute',
              top: '30%',
              left: '50%',
              transform: 'translateX(-50%)',
              color: '#ef4444',
              textAlign: 'center',
              animation: 'blink 0.5s infinite'
          }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', letterSpacing: '4px', border: '2px solid #ef4444', padding: '10px 20px', borderRadius: '4px', backgroundColor: 'rgba(50,0,0,0.5)' }}>
                  WARNING
              </div>
              <div style={{ fontSize: '14px', marginTop: '4px' }}>OFF TRACK</div>
          </div>
      )}

      <style jsx>{`
        @keyframes blink {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
        @keyframes popIn {
            0% { opacity: 0; transform: translateX(-50%) scale(0.8); }
            100% { opacity: 1; transform: translateX(-50%) scale(1); }
        }
      `}</style>
    </div>
  );
}