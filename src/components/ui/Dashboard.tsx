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
        fontFamily: "'Roboto Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
        fontVariantNumeric: 'tabular-nums',
        overflow: 'hidden',
        zIndex: 50
    }}>
      
      {/* Added: display area for scoring feedback (OK messages)
        Shown at the top center of the screen.
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
                  backgroundColor: 'rgba(10, 10, 10, 0.88)',
                  border: '1px solid #e5e5e5',
                  borderLeft: '4px solid #dc2626',
                  borderRadius: '2px',
                  padding: '14px 28px',
                  color: '#f5f5f5',
                  fontSize: '18px',
                  fontWeight: 600,
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
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
              color: '#dc2626',
              textAlign: 'center',
              animation: 'blink 0.5s infinite'
          }}>
              <div style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '4px', border: '1px solid #dc2626', borderRadius: '2px', padding: '8px 18px', backgroundColor: 'rgba(20,20,20,0.7)', color: '#dc2626' }}>
                  WARNING
              </div>
              <div style={{ fontSize: '13px', marginTop: '4px', color: '#a3a3a3', letterSpacing: '2px' }}>OFF TRACK</div>
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