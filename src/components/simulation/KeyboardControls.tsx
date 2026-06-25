"use client";

import { useEffect } from "react";
import { useDrivingStore } from "@/lib/store";

// Steering magnitude applied per key press. The car physics applies its own
// curve/boost on top of this (see Car.tsx), so a partial value already gives a
// firm turn without being twitchy.
const STEER_AMOUNT = 0.6;

export default function KeyboardControls() {
  const setPedals = useDrivingStore((state) => state.setPedals);
  const setSteering = useDrivingStore((state) => state.setSteering);

  useEffect(() => {
    // Track key states (pedals + steering fallback).
    const keys = {
      ArrowUp: false,
      w: false,
      ArrowDown: false,
      s: false,
      ArrowLeft: false,
      a: false,
      ArrowRight: false,
      d: false,
    };
    type KeyName = keyof typeof keys;
    const isTracked = (k: string): k is KeyName =>
      Object.prototype.hasOwnProperty.call(keys, k);

    const apply = () => {
      // Pedals — instant 0/1 input is fine; Car physics ramps acceleration.
      const gas = keys.ArrowUp || keys.w ? 1.0 : 0.0;
      const brake = keys.ArrowDown || keys.s ? 1.0 : 0.0;
      setPedals(gas, brake);

      // Steering fallback for when the webcam is unavailable. When hands are
      // detected, the vision loop overrides steering every frame; with no
      // camera the vision loop is not running, so these keys take effect.
      const left = keys.ArrowLeft || keys.a;
      const right = keys.ArrowRight || keys.d;
      const steer = right ? STEER_AMOUNT : left ? -STEER_AMOUNT : 0;
      setSteering(steer);
    };

    // Normalize single-character keys to lowercase so WASD still works with Caps
    // Lock or Shift (which report 'W'/'A'/'S'/'D'). Named keys like 'ArrowUp' are
    // longer than one char and pass through unchanged.
    const normalize = (key: string) => (key.length === 1 ? key.toLowerCase() : key);

    const handleKeyDown = (e: KeyboardEvent) => {
      const k = normalize(e.key);
      if (isTracked(k)) {
        keys[k] = true;
        apply();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const k = normalize(e.key);
      if (isTracked(k)) {
        keys[k] = false;
        apply();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [setPedals, setSteering]);

  return null; // Logic only component
}
