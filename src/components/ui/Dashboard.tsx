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
                  backgroundColor: 'rgba(5, 5, 10, 0.82)',
                  border: '2px solid #22d3ee',
                  borderRadius: '10px',
                  padding: '16px 32px',
                  color: '#22d3ee',
                  fontSize: '26px',
                  fontWeight: 900,
                  fontStyle: 'italic',
                  letterSpacing: '1px',
                  boxShadow: '0 0 30px rgba(34, 211, 238, 0.5)',
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
              color: '#d946ef',
              textAlign: 'center',
              animation: 'blink 0.5s infinite'
          }}>
              <div style={{ fontSize: '26px', fontWeight: 900, fontStyle: 'italic', letterSpacing: '4px', border: '2px solid #d946ef', padding: '10px 22px', borderRadius: '6px', backgroundColor: 'rgba(30,0,30,0.55)', boxShadow: '0 0 30px rgba(217,70,239,0.55)', color: '#d946ef' }}>
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