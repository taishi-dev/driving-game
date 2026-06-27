"use client";

import { useDrivingStore } from "@/lib/store";

export function Dashboard() {
  const isOffTrack = useDrivingStore(state => state.isOffTrack);

  // Added: get the message from the store
  const drivingFeedback = useDrivingStore(state => state.drivingFeedback);

  const speed = useDrivingStore(state => state.speed);
  const gear = useDrivingStore(state => state.gear);
  const throttle = useDrivingStore(state => state.throttle);
  const brake = useDrivingStore(state => state.brake);

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
                  backgroundColor: 'rgba(0, 0, 0, 0.82)',
                  border: '2px solid #fbbf24',
                  borderRadius: '10px',
                  padding: '16px 32px',
                  color: '#fbbf24',
                  fontSize: '26px',
                  fontWeight: 900,
                  fontStyle: 'italic',
                  letterSpacing: '1px',
                  boxShadow: '0 0 28px rgba(251, 191, 36, 0.45)',
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
              <div style={{ fontSize: '26px', fontWeight: 900, fontStyle: 'italic', letterSpacing: '4px', border: '2px solid #ef4444', padding: '10px 22px', borderRadius: '6px', backgroundColor: 'rgba(50,0,0,0.55)', boxShadow: '0 0 26px rgba(239,68,68,0.5)' }}>
                  WARNING
              </div>
              <div style={{ fontSize: '14px', marginTop: '4px' }}>OFF TRACK</div>
          </div>
      )}

      {/* In-drive HUD: gear + speed + throttle (Asphalt gauge) */}
      <div style={{ position: 'absolute', bottom: '32px', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'flex-end', gap: '24px' }}>
        <div style={{ fontStyle: 'italic', fontWeight: 900, fontSize: '28px', color: '#fbbf24', textShadow: '0 0 18px rgba(251,191,36,0.6)', border: '2px solid #fbbf24', borderRadius: '8px', padding: '4px 14px', background: 'rgba(0,0,0,0.5)' }}>
          {gear}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <span style={{ fontStyle: 'italic', fontWeight: 900, fontSize: '64px', lineHeight: 1, color: '#ffffff', textShadow: '0 0 24px rgba(251,191,36,0.7)' }}>{speed}</span>
          <span style={{ fontStyle: 'italic', fontWeight: 800, fontSize: '18px', color: '#3b82f6', letterSpacing: '2px' }}>KM/H</span>
        </div>
        <div style={{ width: '120px', height: '10px', background: 'rgba(255,255,255,0.12)', borderRadius: '6px', overflow: 'hidden', alignSelf: 'center' }}>
          <div style={{ width: `${Math.round(throttle * 100)}%`, height: '100%', background: brake > 0 ? '#ef4444' : '#fbbf24', boxShadow: '0 0 14px rgba(251,191,36,0.7)', transition: 'width 0.08s linear' }} />
        </div>
      </div>

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