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

/**
 * Cria UMA máscara (buffer) por rua, com _rua_uid nas properties.
 * Retorna FeatureCollection (ou null se não tiver nada).
 */
function buildRuaRestrictionMaskPerRua(ruas = [], defaultWidth = 12) {
    const features = [];

    for (const r of ruas) {
        try {
            if (!r?.geometry) continue;
            const uid = r?.properties?._uid;
            const w = Number(r?.properties?.width_m ?? defaultWidth);
            if (!Number.isFinite(w) || w <= 0) continue;

            const buf = bufferRuaSafe(r, w / 2);
            if (!buf || !buf.geometry) continue;

            // garante Feature "limpa"
            const feat = {
                type: "Feature",
                geometry: buf.geometry,
                properties: {
                    ...(buf.properties || {}),
                    role: "rua_mask",
                    width_m: w,
                    _rua_uid: uid, // vínculo com a rua original
                },
            };
            features.push(feat);
        } catch {
            // ignora erros de rua individual
        }
    }

    if (!features.length) return null;

    return {
        type: "FeatureCollection",
        features,
    };
}

/**
 * Clipa CADA máscara individualmente pela AOI, mantendo a correspondência _rua_uid.
 */
function buildRuaRestrictionMaskClippedPerRua(ruaMaskRaw, aoiWgs) {
    if (!ruaMaskRaw || !aoiWgs) return null;
    const outFeatures = [];

    for (const feat of ruaMaskRaw.features || []) {
        const maskFeat = feat;
        if (!maskFeat?.geometry) continue;

        let clipped = null;

        try {
            clipped =
                clipToAoiWgsRobusto(maskFeat, aoiWgs, {
                    gridDecimals: 1,
                    shrinkMeters: 0,
                }) || null;
        } catch {
            clipped = null;
        }

        if (
            (!clipped || turf.area(clipped) <= 1e-9) &&
            booleanIntersectsSafe(maskFeat, aoiWgs)
        ) {
            try {
                clipped =
                    clipToAoiWgsTeimoso(maskFeat, aoiWgs, {
                        gridDecimals: 1,
                    }) || null;
            } catch {
                clipped = null;
            }
        }

        if (!clipped || turf.area(clipped) <= 1e-9) {
            try {
                clipped = clipToAoiWgs_PlanarNoProj(maskFeat, aoiWgs) || null;
            } catch {
                clipped = null;
            }
        }

        if (!clipped || turf.area(clipped) <= 1e-9) {
            try {
                clipped = turf.intersect(maskFeat, aoiWgs) || null;
            } catch {
                clipped = null;
            }
            if (clipped) {
                try {
                    clipped = turf.cleanCoords(clipped);
                } catch { }
            }
        }

        if (clipped && clipped.geometry) {
            // preserva _rua_uid e demais properties
            clipped.properties = {
                ...(maskFeat.properties || {}),
                ...(clipped.properties || {}),
            };
            outFeatures.push(clipped);
        }
    }

    if (!outFeatures.length) return null;

    return {
        type: "FeatureCollection",
        features: outFeatures,
    };
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
            // 1) Máscara bruta: uma feature por rua
            const rawFc = buildRuaRestrictionMaskPerRua(ruas, defaultRuaWidth) || null;
            setRuaMaskRaw(rawFc);

            // 2) Máscara clipada por AOI (por feature)
            const clippedFc =
                rawFc && aoiForClip
                    ? buildRuaRestrictionMaskClippedPerRua(rawFc, aoiForClip)
                    : null;
            setRuaMaskClip(clippedFc);

            const AREA_MIN = 1e-6;
            const visible =
                aoiForClip && clippedFc && turf.area(clippedFc) > AREA_MIN
                    ? clippedFc
                    : rawFc || null;

            setRuaMask(visible);

            // logs úteis
            if (rawFc) describeFeature("ruaMask_raw_FC", rawFc);
            if (aoiForClip) describeFeature("aoi_clip", aoiForClip);
            if (visible) describeFeature("ruaMask_visible_FC", visible);
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
                if (itUid !== uid) return it;
                return {
                    ...newGJ,
                    properties: {
                        ...(newGJ.properties || {}),
                        _uid: uid,
                        role: "rua",
                        width_m: it?.properties?.width_m ?? 12,
                    },
                };
            })
        );
    }, []);

    const updateRuaWidth = useCallback((uid, width) => {
        const w = Number(width);
        if (!Number.isFinite(w) || w <= 0) return;
        setRuas((prev) =>
            prev.map((it, idx) => {
                const itUid = it?.properties?._uid ?? idx;
                return itUid === uid
                    ? {
                        ...it,
                        properties: {
                            ...(it.properties || {}),
                            _uid: uid,
                            width_m: w,
                        },
                    }
                    : it;
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
        ruaMask,      // FeatureCollection de buffers por rua, já com _rua_uid
        ruaMaskRaw,
        ruaMaskClip,
        addRuaFromGJ,
        updateRuaGeometry,
        updateRuaWidth,
        removeRua,
        recomputeMask,
    };
}
