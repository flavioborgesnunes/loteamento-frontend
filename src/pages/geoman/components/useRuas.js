import { useCallback, useEffect, useMemo, useState } from "react";
import * as turf from "@turf/turf";
import {
    booleanIntersectsSafe,
    describeFeature,
    clipToAoiWgsRobusto,
    clipToAoiWgsTeimoso,
    clipToAoiWgs_PlanarNoProj,
} from "../geoUtils";

/** Buffer seguro (caps arredondados) a partir de LineString/MultiLineString em WGS84. */
function bufferRuaSafe(ruaFeature, widthMetersHalf) {
    try {
        if (!ruaFeature?.geometry) return null;
        const g = ruaFeature.geometry;
        if (g.type === "LineString") {
            if (!Array.isArray(g.coordinates) || g.coordinates.length < 2) return null;
        } else if (g.type === "MultiLineString") {
            const ok =
                Array.isArray(g.coordinates) &&
                g.coordinates.some((part) => Array.isArray(part) && part.length >= 2);
            if (!ok) return null;
        } else {
            return null;
        }
        let fW = ruaFeature;
        try {
            fW = turf.cleanCoords(ruaFeature);
        } catch { }
        const bufW = turf.buffer(fW, widthMetersHalf, {
            units: "meters",
            steps: 16,
        });
        if (!bufW || !bufW.geometry) return null;
        try {
            return turf.cleanCoords(bufW);
        } catch {
            return bufW;
        }
    } catch {
        return null;
    }
}

/** Apenas máscara (sem AOI) — buffer padrão para todas as ruas. */
function buildRuaRestrictionMask(ruas = [], defaultWidth = 12) {
    const buffers = [];
    for (const r of ruas) {
        try {
            const w = Number(r?.properties?.width_m ?? defaultWidth);
            if (!Number.isFinite(w) || w <= 0) continue;
            const buf = bufferRuaSafe(r, w / 2);
            if (buf && buf.geometry) {
                try {
                    buffers.push(turf.cleanCoords(buf));
                } catch {
                    buffers.push(buf);
                }
            }
        } catch { }
    }
    if (!buffers.length) return null;
    // union com tolerância leve
    let acc = buffers[0];
    for (let i = 1; i < buffers.length; i++) {
        try {
            const u = turf.union(acc, buffers[i]);
            acc = u || acc;
        } catch {
            // fallback: multipolygon concatenado
            const toMP = (f) =>
                f.geometry.type === "Polygon"
                    ? [f.geometry.coordinates]
                    : f.geometry.coordinates;
            acc = {
                type: "Feature",
                properties: {},
                geometry: {
                    type: "MultiPolygon",
                    coordinates: [...toMP(acc), ...toMP(buffers[i])],
                },
            };
        }
    }
    try {
        acc = turf.cleanCoords(acc);
    } catch { }
    return acc;
}

/** Máscara de ruas CLIPPADA pela AOI (robusta + fallback). */
function buildRuaRestrictionMaskClipped(ruas = [], aoiWgs, defaultWidth = 12) {
    const mask = buildRuaRestrictionMask(ruas, defaultWidth);
    if (!mask) return null;
    if (!aoiWgs) return mask;

    let out =
        clipToAoiWgsRobusto(mask, aoiWgs, { gridDecimals: 1, shrinkMeters: 0 }) ||
        null;

    if ((!out || turf.area(out) <= 1e-9) && booleanIntersectsSafe(mask, aoiWgs)) {
        out = clipToAoiWgsTeimoso(mask, aoiWgs, { gridDecimals: 1 }) || null;
    }
    if (!out || turf.area(out) <= 1e-9) {
        out = clipToAoiWgs_PlanarNoProj(mask, aoiWgs) || null;
    }
    if (!out || turf.area(out) <= 1e-9) {
        try { out = turf.intersect(mask, aoiWgs) || null; } catch { }
        try { if (out) out = turf.cleanCoords(out); } catch { }
    }
    return out || null;
}

/**
 * Hook das RUAS: estado, criação/edição/remoção e máscara sempre visível (clip por AOI).
 * aoiForClip: Feature (WGS84) da AOI autoritativa (ex.: summary.aoi).
 */
export default function useRuas({ aoiForClip }) {
    const [ruas, setRuas] = useState([]);
    const [defaultRuaWidth, setDefaultRuaWidth] = useState(12);

    const [ruaMaskRaw, setRuaMaskRaw] = useState(null);
    const [ruaMaskClip, setRuaMaskClip] = useState(null);
    const [ruaMask, setRuaMask] = useState(null);

    const recomputeMask = useCallback(() => {
        try {
            const raw = buildRuaRestrictionMask(ruas, defaultRuaWidth) || null;
            setRuaMaskRaw(raw);

            const clipped =
                raw && aoiForClip
                    ? buildRuaRestrictionMaskClipped(ruas, aoiForClip, defaultRuaWidth)
                    : null;
            setRuaMaskClip(clipped);

            const AREA_MIN = 1e-6;
            const visibleMask =
                aoiForClip && clipped && turf.area(clipped) > AREA_MIN ? clipped : raw || null;
            setRuaMask(visibleMask);

            // logs úteis
            if (raw) describeFeature("ruaMask_raw", raw);
            if (aoiForClip) describeFeature("aoi_clip", aoiForClip);
            if (visibleMask) describeFeature("ruaMask_visible", visibleMask);
        } catch (e) {
            console.error("[useRuas] erro ao recomputar máscara:", e);
            setRuaMaskRaw(null);
            setRuaMaskClip(null);
            setRuaMask(null);
        }
    }, [ruas, defaultRuaWidth, aoiForClip]);

    useEffect(() => {
        recomputeMask();
    }, [recomputeMask]);

    // API de mutação (todas recalculam a máscara por dependerem do estado)
    const addRuaFromGJ = useCallback(
        (gj, defaultWidth) => {
            if (!gj?.geometry) return;
            const clean = turf.cleanCoords(turf.feature(gj.geometry));
            const feat = {
                type: "Feature",
                geometry: clean.geometry,
                properties: {
                    ...(gj.properties || {}),
                    role: "rua",
                    width_m: Number(defaultWidth ?? defaultRuaWidth) || defaultRuaWidth,
                    _uid: Date.now() + Math.random(),
                },
            };
            setRuas((prev) => [...prev, feat]);
        },
        [defaultRuaWidth]
    );

    const updateRuaGeometry = useCallback((uid, newGJ) => {
        setRuas((prev) =>
            prev.map((it, idx) => {
                const itUid = it?.properties?._uid ?? idx;
                return itUid === uid ? { ...newGJ, properties: { ...(newGJ.properties || {}), _uid: uid, role: "rua", width_m: it?.properties?.width_m ?? 12 } } : it;
            })
        );
    }, []);

    const updateRuaWidth = useCallback((uid, width) => {
        const w = Number(width);
        if (!Number.isFinite(w) || w <= 0) return;
        setRuas((prev) =>
            prev.map((it, idx) => {
                const itUid = it?.properties?._uid ?? idx;
                return itUid === uid ? { ...it, properties: { ...(it.properties || {}), _uid: uid, width_m: w } } : it;
            })
        );
    }, []);

    const removeRua = useCallback((uid) => {
        setRuas((prev) =>
            prev.filter((it, idx) => {
                const itUid = it?.properties?._uid ?? idx;
                return itUid !== uid;
            })
        );
    }, []);

    return {
        ruas,
        setRuas,
        defaultRuaWidth,
        setDefaultRuaWidth,
        ruaMask,          // sempre visível se existir
        ruaMaskRaw,
        ruaMaskClip,
        addRuaFromGJ,
        updateRuaGeometry,
        updateRuaWidth,
        removeRua,
        recomputeMask,
    };
}
