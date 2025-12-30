
"use client";

import { useDrivingStore } from "@/lib/store";

export function Dashboard() {
  const isOffTrack = useDrivingStore(state => state.isOffTrack);

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
        zIndex: 50 // Ensure high z-index
    }}>
      
      {/* 
        HEADS UP DISPLAY (HUD) LAYER 
        Projected "on glass" feeling
      */}
      
      {/* 
        1. MECHANICAL INSTRUMENT CLUSTER LAYER (Bottom)
        REMOVED as per user request ("Remove speedometer")
      */}

      {/* 
        2. HEADS UP DISPLAY (HUD) LAYER
        REMOVED speed and pedals as per user request.
        Only Critical Warnings remain.
      */}

      {/* Warning Overlay (HUD Style) */}
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
      `}</style>
    </div>
  );
}
