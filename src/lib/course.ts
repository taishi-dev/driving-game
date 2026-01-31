import * as THREE from "three";

export function getCoursePath(
  lesson: 
    | "straight" 
    | "s-curve" 
    | "crank" 
    | "left-turn" 
    | "right-turn" 
    | "traffic-light" 
    | "free-mode"
    | "crosswalk"
    | "railroad-crossing"
): THREE.CurvePath<THREE.Vector3> {
  const path = new THREE.CurvePath<THREE.Vector3>();

  if (lesson === "free-mode") {
    path.add(new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)));
    return path;
  }

  if (lesson === "left-turn") {
    path.add(new THREE.LineCurve3(new THREE.Vector3(0, 0, 20), new THREE.Vector3(0, 0, -30)));
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0, -30),
      new THREE.Vector3(0, 0, -38),
      new THREE.Vector3(-8, 0, -38)
    );
    path.add(curve);
    path.add(new THREE.LineCurve3(new THREE.Vector3(-8, 0, -38), new THREE.Vector3(-60, 0, -38)));

  } else if (lesson === "right-turn") {
    path.add(new THREE.LineCurve3(new THREE.Vector3(0, 0, 20), new THREE.Vector3(0, 0, -30)));
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0, -30),
      new THREE.Vector3(0, 0, -38),
      new THREE.Vector3(8, 0, -38)
    );
    path.add(curve);
    path.add(new THREE.LineCurve3(new THREE.Vector3(8, 0, -38), new THREE.Vector3(60, 0, -38)));

  } else if (lesson === "traffic-light") {
    path.add(new THREE.LineCurve3(new THREE.Vector3(0, 0, 20), new THREE.Vector3(0, 0, -120)));

  } else if (lesson === "s-curve") {
    const curve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(0, 0, 20),
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(14, 0, -30),
        new THREE.Vector3(-14, 0, -60),
        new THREE.Vector3(0, 0, -100),
      ],
      false,
      "centripetal",
      0.5
    );
    path.add(curve);

  } else if (lesson === "crank") {
    const r = 4;
    const xR = 16;
    const xL = -8;

    path.add(new THREE.LineCurve3(new THREE.Vector3(0, 0, 20), new THREE.Vector3(0, 0, -15)));
    path.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, -15), new THREE.Vector3(0, 0, -15 - r), new THREE.Vector3(r, 0, -15 - r)));
    path.add(new THREE.LineCurve3(new THREE.Vector3(r, 0, -15 - r), new THREE.Vector3(xR - r, 0, -15 - r)));
    path.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(xR - r, 0, -15 - r), new THREE.Vector3(xR, 0, -15 - r), new THREE.Vector3(xR, 0, -15 - 2 * r)));
    path.add(new THREE.LineCurve3(new THREE.Vector3(xR, 0, -15 - 2 * r), new THREE.Vector3(xR, 0, -55)));
    path.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(xR, 0, -55), new THREE.Vector3(xR, 0, -55 - r), new THREE.Vector3(xR - r, 0, -55 - r)));
    path.add(new THREE.LineCurve3(new THREE.Vector3(xR - r, 0, -55 - r), new THREE.Vector3(xL + r, 0, -55 - r)));
    path.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(xL + r, 0, -55 - r), new THREE.Vector3(xL, 0, -55 - r), new THREE.Vector3(xL, 0, -55 - 2 * r)));
    path.add(new THREE.LineCurve3(new THREE.Vector3(xL, 0, -55 - 2 * r), new THREE.Vector3(xL, 0, -100)));

  } else {
    path.add(new THREE.LineCurve3(new THREE.Vector3(0, 0, 20), new THREE.Vector3(0, 0, -200)));
  }

  return path;
}