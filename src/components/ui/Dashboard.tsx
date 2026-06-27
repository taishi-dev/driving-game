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

      {/* In-drive HUD: telemetry strip (Grid) */}
      <div style={{ position: 'absolute', bottom: '28px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '1px', background: '#dc2626', padding: '1px', borderRadius: '2px' }}>
        <div style={{ background: 'rgba(15,15,15,0.92)', padding: '8px 16px', minWidth: '120px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', letterSpacing: '2px', color: '#a3a3a3' }}>SPEED</div>
          <div style={{ fontSize: '30px', fontWeight: 700, color: '#f5f5f5' }}>{speed}<span style={{ fontSize: '12px', color: '#a3a3a3', marginLeft: '4px' }}>KM/H</span></div>
        </div>
        <div style={{ background: 'rgba(15,15,15,0.92)', padding: '8px 16px', minWidth: '72px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', letterSpacing: '2px', color: '#a3a3a3' }}>GEAR</div>
          <div style={{ fontSize: '30px', fontWeight: 700, color: '#dc2626' }}>{gear}</div>
        </div>
        <div style={{ background: 'rgba(15,15,15,0.92)', padding: '8px 16px', minWidth: '120px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', letterSpacing: '2px', color: '#a3a3a3' }}>THROTTLE</div>
          <div style={{ fontSize: '30px', fontWeight: 700, color: brake > 0 ? '#dc2626' : '#f5f5f5' }}>{Math.round(throttle * 100)}<span style={{ fontSize: '12px', color: '#a3a3a3' }}>%</span></div>
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