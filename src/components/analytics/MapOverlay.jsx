import React, { useEffect, useRef } from "react";
import Cesium from "@/lib/cesiumConfig";

/**
 * HTML overlay labels for the Cesium map.
 *
 * Cesium's built-in canvas labels cannot shape Arabic text — the characters
 * render disconnected and unreadable. This component renders plain HTML labels
 * (which handle Arabic ligatures perfectly) and positions them over the map
 * every frame using Cesium's world-to-screen coordinate transform.
 */
export default function MapOverlay({ viewerRef, items }) {
  const itemRefs = useRef({});

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || !items.length) return;

    const update = () => {
      for (const item of items) {
        const el = itemRefs.current[item.id];
        if (!el) continue;
        const cart = Cesium.Cartesian3.fromDegrees(item.lon, item.lat);
        const transform = Cesium.SceneTransforms.worldToWindowCoordinates || Cesium.SceneTransforms.wgs84ToWindowCoordinates;
        const win = transform.call(Cesium.SceneTransforms, viewer.scene, cart);
        if (!win || !isFinite(win.x) || !isFinite(win.y)) {
          el.style.display = "none";
          continue;
        }
        el.style.display = "";
        el.style.left = `${win.x}px`;
        el.style.top = `${win.y}px`;
      }
    };

    viewer.scene.postRender.addEventListener(update);
    return () => viewer.scene.postRender.removeEventListener(update);
  }, [viewerRef, items]);

  return (
    <div dir="rtl" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 10 }}>
      {items.map((item) => (
        <div
          key={item.id}
          ref={(el) => { itemRefs.current[item.id] = el; }}
          style={{ position: "absolute", transform: "translate(-50%, -50%)" }}
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}