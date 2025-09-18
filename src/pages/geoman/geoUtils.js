// src/pages/geoman/geoUtils.js
import * as turf from "@turf/turf";
import * as mpc from "martinez-polygon-clipping";

// ----------------------------------------------------------------------------
// Polygon-Clipping (Martinez) shim
// ----------------------------------------------------------------------------
const pc = {
    union: mpc.union,
    intersection: mpc.intersection,
    difference: mpc.difference ?? mpc.diff,
    xor: mpc.xor,
};

// ----------------------------------------------------------------------------
export const DEBUG = true;
export function DBG(tag, obj) {
    if (!DEBUG) return;
    const ts = new Date().toISOString();
    try {
        obj !== undefined
            ? console.log(`[GEOMAN][${ts}] ${tag}:`, obj)
            : console.log(`[GEOMAN][${ts}] ${tag}`);
    } catch {
        console.log(`[GEOMAN][${ts}] ${tag} <cant-serialize>`);
    }
}

export function logAreas(tag, streetMaskWgs, aoiWgs, clipped) {
    try {
        console.log(`[GEOMAN][DBG][${tag}] áreas m²`, {
            mask_in: streetMaskWgs ? turf.area(streetMaskWgs) : 0,
            aoi: aoiWgs ? turf.area(aoiWgs) : 0,
            clipped: clipped ? turf.area(clipped) : 0,
            outside:
                streetMaskWgs && aoiWgs
                    ? turf.area(
                        turf.difference(streetMaskWgs, aoiWgs) ||
                        turf.featureCollection([])
                    )
                    : 0,
        });
    } catch (e) {
        console.warn(`[GEOMAN][DBG][${tag}] logAreas falhou`, e);
    }
}

// ----------------------------------------------------------------------------
// Helpers gerais / conversões
// ----------------------------------------------------------------------------

// ---------- Debug helpers extras ----------
export function describeFeature(label, f) {
    try {
        const typ = f?.geometry?.type || f?.type || typeof f;
        const area = (f && (f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon")) ? turf.area(f) : 0;
        const bbox = safeBBox(f);
        const b = bbox ? { minX: bbox[0], minY: bbox[1], maxX: bbox[2], maxY: bbox[3] } : null;
        const rings =
            f?.geometry?.type === "Polygon" ? f.geometry.coordinates?.length :
                f?.geometry?.type === "MultiPolygon" ? f.geometry.coordinates?.reduce((acc, p) => acc + (p?.length || 0), 0) :
                    0;
        DBG(`[describe:${label}]`, { type: typ, rings, area_m2: area, bbox: b });
    } catch (e) {
        console.warn(`[describe:${label}] fail`, e);
    }
}

export function booleanIntersectsSafe(a, b) {
    try { return turf.booleanIntersects(a, b); } catch { return false; }
}


/** Deep clone seguro p/ GeoJSON simples. */
function dclone(obj) {
    try {
        return JSON.parse(JSON.stringify(obj));
    } catch {
        return obj;
    }
}

/** Normaliza para FeatureCollection (filtra nulos). */
function toFeatureCollection(input) {
    if (!input) return { type: "FeatureCollection", features: [] };
    if (input.type === "FeatureCollection") {
        const feats = (input.features || []).filter((f) => f && f.geometry);
        return {
            type: "FeatureCollection",
            features: feats.map((f) => dclone(f)),
        };
    }
    if (input.type === "Feature") {
        if (!input.geometry)
            return { type: "FeatureCollection", features: [] };
        return {
            type: "FeatureCollection",
            features: [dclone(input)],
        };
    }
    if (input.type && input.coordinates) {
        return {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    geometry: dclone(input),
                    properties: {},
                },
            ],
        };
    }
    return { type: "FeatureCollection", features: [] };
}

/** BBox [minX, minY, maxX, maxY]; null se vazio. */
function safeBBox(gj) {
    const fc = toFeatureCollection(gj);
    if (!fc.features.length) return null;
    try {
        return turf.bbox(fc);
    } catch {
        return null;
    }
}

/** Força Feature Polygon/MultiPolygon (ou null) em WGS84. */
function asPolyFeatureWgs(input) {
    if (!input) return null;
    let feat = input;
    if (input.type !== "Feature") {
        if (!input.type || !input.coordinates) return null;
        feat = { type: "Feature", geometry: dclone(input), properties: {} };
    } else {
        feat = {
            type: "Feature",
            geometry: dclone(input.geometry),
            properties: dclone(input.properties || {}),
        };
    }
    const t = feat.geometry?.type;
    if (t !== "Polygon" && t !== "MultiPolygon") return null;
    try {
        return turf.cleanCoords(feat);
    } catch {
        return feat;
    }
}

/** Fecha anel de um Polygon (primeiro = último). */
export function ensureClosedPolygon(poly) {
    const p = dclone(poly);
    if (p.geometry?.type !== "Polygon") return p;
    p.geometry.coordinates = p.geometry.coordinates.map((ring) => {
        if (!ring.length) return ring;
        const [fx, fy] = ring[0];
        const [lx, ly] = ring[ring.length - 1];
        if (fx !== lx || fy !== ly) return [...ring, [fx, fy]];
        return ring;
    });
    return p;
}

/** Snap + clean + rewind (outer CCW) em WGS84. */
export function snapWgs(f, precision = 6) {
    try {
        return turf.truncate(turf.cleanCoords(f), {
            precision,
            mutate: false,
        });
    } catch {
        return f;
    }
}
export function rewindOuter(f) {
    try {
        return turf.rewind(f, { reverse: true });
    } catch {
        return f;
    }
}

/** Garante Feature Polygon; dissolve MultiPolygon. */
export function ensureFeaturePolygon(input, label = "geom") {
    if (!input) throw new Error(`${label} ausente`);
    const feat = input.type === "Feature" ? input : turf.feature(input);
    const g = feat.geometry;
    if (!g) throw new Error(`${label} sem geometry`);
    if (g.type === "Polygon") return turf.cleanCoords(feat);
    if (g.type === "MultiPolygon") {
        const polys = g.coordinates.map((rings) => turf.polygon(rings));
        let union = polys[0];
        for (let i = 1; i < polys.length; i++) {
            try {
                union = turf.union(union, polys[i]) || union;
            } catch { }
        }
        return turf.cleanCoords(union);
    }
    throw new Error(
        `${label} precisa ser Polygon/MultiPolygon (atual: ${g.type})`
    );
}

/** Converte Poly WGS84 → Métrico (Mercator), com “cura” leve. */
export function toMercatorPolySafe(f, label) {
    const clean = ensureClosedPolygon(
        ensureFeaturePolygon(rewindOuter(snapWgs(f)), label)
    );
    let fm = turf.toMercator(clean);
    try {
        fm = turf.buffer(fm, 0, { units: "meters" });
    } catch { }
    try {
        fm = turf.simplify(fm, { tolerance: 0.01, highQuality: true });
    } catch { }
    return fm;
}

/** Versão “loose” de projeção (sem simplificar/dissolver). */
function toMercatorPolyLoose(f) {
    let feat = asPolyFeatureWgs(f);
    if (!feat) return null;
    try {
        feat = turf.cleanCoords(feat);
    } catch { }
    let m = turf.toMercator(feat);
    try {
        m = turf.buffer(m, 0, { units: "meters" });
    } catch { }
    return m;
}

/** Fecha anel [x,y]. */
const closeRing = (ring) => {
    if (!ring?.length) return ring;
    const a = ring[0],
        b = ring[ring.length - 1];
    if (a[0] !== b[0] || a[1] !== b[1]) return [...ring, [a[0], a[1]]];
    return ring;
};

/** Mercator Feature → estrutura MultiPolygon do polygon-clipping. */
export function toPcMultiPolygon(fMerc) {
    const g = fMerc?.geometry;
    if (!g) return [];
    if (g.type === "Polygon") return [g.coordinates.map(closeRing)];
    if (g.type === "MultiPolygon")
        return g.coordinates.map((poly) => poly.map(closeRing));
    return [];
}

/** Garante orientação padrão (outer CCW, holes CW) e fecha anéis em WGS. */
function orientAndCloseWgs(feature) {
    if (!feature?.geometry) return feature;
    const f = dclone(feature);
    if (f.geometry.type === "Polygon") {
        let p = turf.polygon(f.geometry.coordinates);
        try { p = turf.rewind(p, { reverse: false }); } catch { }
        p = ensureClosedPolygon(p);
        return p;
    }
    if (f.geometry.type === "MultiPolygon") {
        const polys = f.geometry.coordinates.map((rings) => {
            let p = turf.polygon(rings);
            try { p = turf.rewind(p, { reverse: false }); } catch { }
            p = ensureClosedPolygon(p);
            return p.geometry.coordinates;
        });
        return turf.multiPolygon(polys);
    }
    return f;
}


/** Resultado polygon-clipping → Feature (Mercator). */
export function pcResultToFeature(mp) {
    if (!mp || !mp.length) return null;
    const norm = mp.map((poly) => poly.map(closeRing));
    try {
        return norm.length === 1 ? turf.polygon(norm[0]) : turf.multiPolygon(norm);
    } catch {
        return null;
    }
}

/** Cria Feature c/ geometry original em properties._orig. */
export function featureWithOriginal(f, originFmt = "geojson") {
    if (!f) return null;
    let feat;
    if (f.type === "Feature") {
        feat = {
            type: "Feature",
            geometry: dclone(f.geometry),
            properties: dclone(f.properties || {}),
        };
    } else if (f.type && f.coordinates) {
        feat = { type: "Feature", geometry: dclone(f), properties: {} };
    } else {
        return null;
    }
    try {
        feat = turf.cleanCoords(feat);
    } catch { }
    feat.properties = feat.properties || {};
    feat.properties._orig = { fmt: originFmt, geom: dclone(feat.geometry) };
    return feat;
}

// ----------------------------------------------------------------------------
// Métricas e validação
// ----------------------------------------------------------------------------
const AREA_EPS = 1e-4;

function isValidPoly(feat) {
    try {
        if (!feat || feat.type !== "Feature" || !feat.geometry) return false;
        const t = feat.geometry.type;
        if (t !== "Polygon" && t !== "MultiPolygon") return false;
        const a = turf.area(feat);
        return Number.isFinite(a) && a > AREA_EPS;
    } catch {
        return false;
    }
}

/** Combina dois polígonos em MultiPolygon sem perder partes (fallback). */
function combineAsMultiPolygon(a, b) {
    if (!isValidPoly(a) && !isValidPoly(b)) return null;
    if (!isValidPoly(a)) return turf.cleanCoords(b);
    if (!isValidPoly(b)) return turf.cleanCoords(a);
    const aCoords =
        a.geometry.type === "Polygon"
            ? [a.geometry.coordinates]
            : a.geometry.coordinates;
    const bCoords =
        b.geometry.type === "Polygon"
            ? [b.geometry.coordinates]
            : b.geometry.coordinates;
    return turf.cleanCoords({
        type: "Feature",
        properties: {},
        geometry: {
            type: "MultiPolygon",
            coordinates: [...aCoords, ...bCoords],
        },
    });
}

/** Tenta union(a,b) com curas; se falhar, combina. */
function safeUnion(a, b) {
    if (!isValidPoly(a)) return isValidPoly(b) ? turf.cleanCoords(b) : null;
    if (!isValidPoly(b)) return turf.cleanCoords(a);
    try {
        const u = turf.union(a, b);
        if (isValidPoly(u)) return turf.cleanCoords(u);
    } catch { }
    try {
        const aa = turf.buffer(a, 0, { units: "meters" });
        const bb = turf.buffer(b, 0, { units: "meters" });
        const u = turf.union(aa, bb);
        if (isValidPoly(u)) return turf.cleanCoords(u);
    } catch { }
    const comb = combineAsMultiPolygon(a, b);
    return isValidPoly(comb) ? comb : null;
}

/** União robusta de N → 1. */
export function unionAll(features = []) {
    const polys = features
        .map((f) => {
            try {
                return turf.cleanCoords(f);
            } catch {
                return null;
            }
        })
        .filter(isValidPoly);
    if (polys.length === 0) return null;
    if (polys.length === 1) return polys[0];
    let acc = polys[0];
    for (let i = 1; i < polys.length; i++) {
        const next = safeUnion(acc, polys[i]);
        acc = next ?? combineAsMultiPolygon(acc, polys[i]);
    }
    return acc;
}

/** base − (vários recortes) com tolerância e limpeza. */
export function differenceMany(base, subtractList = []) {
    if (!isValidPoly(base)) return null;
    const subs = subtractList.filter(isValidPoly);
    if (!subs.length) return base;
    let acc = base;
    for (const s of subs) {
        try {
            const d = turf.difference(acc, s);
            if (isValidPoly(d)) {
                acc = turf.cleanCoords(d);
                continue;
            }
        } catch { }
        try {
            const a0 = turf.buffer(acc, 0, { units: "meters" });
            const s0 = turf.buffer(s, 0, { units: "meters" });
            const d = turf.difference(a0, s0);
            if (isValidPoly(d)) acc = turf.cleanCoords(d);
        } catch { }
    }
    return isValidPoly(acc) ? acc : null;
}

// ----------------------------------------------------------------------------
// Fit bounds Leaflet
// ----------------------------------------------------------------------------
export function fitToFeatures(map, featureOrCollection, opts = {}) {
    if (!map || !featureOrCollection) return;
    const bbox = safeBBox(featureOrCollection);
    if (!bbox) return;
    const [minX, minY, maxX, maxY] = bbox;
    const southWest = [minY, minX];
    const northEast = [maxY, maxX];
    const padding = opts.padding ?? [30, 30];
    const maxZoom = typeof opts.maxZoom === "number" ? opts.maxZoom : 18;
    try {
        map.fitBounds([southWest, northEast], { padding, maxZoom });
    } catch { }
}

// ----------------------------------------------------------------------------
// Conversão Leaflet layer → GeoJSON WGS84
// ----------------------------------------------------------------------------
export function layerToWgs84Feature(layer, roleLabel = "geom") {
    try {
        if (!layer?.getLatLngs) return null;
        const ll = layer.getLatLngs();
        const close = (ring) => {
            if (!ring?.length) return ring;
            const a = ring[0],
                b = ring[ring.length - 1];
            if (a.lng !== b.lng || a.lat !== b.lat) return [...ring, a];
            return ring;
        };
        const ringToCoords = (ring) => close(ring).map((p) => [p.lng, p.lat]);

        // Polygon => [rings][LatLng]
        if (
            Array.isArray(ll) &&
            ll.length &&
            Array.isArray(ll[0]) &&
            !Array.isArray(ll[0][0])
        ) {
            const coords = ll.map(ringToCoords);
            return turf.feature(
                { type: "Polygon", coordinates: coords },
                { _role: roleLabel }
            );
        }
        // MultiPolygon => [polys][rings][LatLng]
        if (
            Array.isArray(ll) &&
            Array.isArray(ll[0]) &&
            Array.isArray(ll[0][0])
        ) {
            const coords = ll.map((poly) => poly.map(ringToCoords));
            return turf.feature(
                { type: "MultiPolygon", coordinates: coords },
                { _role: roleLabel }
            );
        }
        return null;
    } catch {
        return null;
    }
}

// ----------------------------------------------------------------------------
// Quantização/Normalização métrica unificada p/ clipping
// ----------------------------------------------------------------------------

/** Arredonda números para N casas decimais (grade de 10^-N m). */
function roundN(x, n = 1) {
    const f = Math.pow(10, n);
    return Math.round(x * f) / f;
}

/** Quantiza coords [x,y] (Mercator) para grade de 10^-n metros. */
function quantizeXY(x, y, n = 1) {
    return [roundN(x, n), roundN(y, n)];
}

/** Quantiza todas coords de um Feature (já em Mercator). */
function quantizeMercatorFeature(f, decimals = 1) {
    if (!f?.geometry) return f;
    const g = f.geometry;
    const q = (coords) => {
        if (typeof coords[0] === "number") {
            const [x, y] = coords;
            return quantizeXY(x, y, decimals);
        }
        return coords.map(q);
    };
    return {
        type: "Feature",
        properties: { ...(f.properties || {}) },
        geometry: { ...g, coordinates: q(g.coordinates) },
    };
}

/** Converte Polygon/MultiPolygon WGS→Mercator, cura e quantiza. */
function normalizePolyToMercatorForPC(input, label = "geom", decimals = 1) {
    let fm = toMercatorPolySafe(input, label);
    try {
        fm = turf.buffer(fm, 0, { units: "meters" });
    } catch { }
    fm = quantizeMercatorFeature(fm, decimals);
    try {
        fm = turf.buffer(fm, 0, { units: "meters" });
    } catch { }
    return fm;
}

// ----------------------------------------------------------------------------
// --- CLIP ROBUSTO: polígono ∩ AOI (ambos WGS84) com métrico+quantização+martinez
// ----------------------------------------------------------------------------

/**
 * Corta (polígono WGS) pela AOI (WGS) usando normalização métrica unificada:
 *  - WGS→Mercator
 *  - buffer(0) + quantização (0,1 m)
 *  - interseção Martinez
 *  - buffer(-shrink) p/ matar rebarbas
 *  - volta p/ WGS + clean
 */
export function clipToAoiWgsRobusto(
    polyWgs,
    aoiWgs,
    { gridDecimals = 1, shrinkMeters = 0.2 } = {}
) {
    const maskF = asPolyFeatureWgs(polyWgs);
    const aoiF = asPolyFeatureWgs(aoiWgs);
    if (!maskF) return null;
    if (!aoiF) return maskF;

    // normaliza ambos para Mercator com mesma grade
    const mM = normalizePolyToMercatorForPC(maskF, "mask", gridDecimals);
    const aM = normalizePolyToMercatorForPC(aoiF, "aoi", gridDecimals);

    const A = toPcMultiPolygon(mM);
    const B = toPcMultiPolygon(aM);
    if (!A.length || !B.length) return null;

    let inter;
    try {
        inter = pc.intersection(A, B);
    } catch {
        inter = null;
    }
    if (!inter || !inter.length) return null;

    // volta para métrico Feature, encolhe levemente e limpa
    let clippedM = pcResultToFeature(inter);
    try {
        clippedM = turf.buffer(clippedM, 0, { units: "meters" });
    } catch { }

    if (shrinkMeters && Number.isFinite(shrinkMeters) && shrinkMeters > 0) {
        try {
            clippedM = turf.buffer(clippedM, -Math.abs(shrinkMeters), {
                units: "meters",
            });
        } catch { }
        try {
            clippedM = turf.buffer(clippedM, 0, { units: "meters" });
        } catch { }
    }

    // quantiza novamente após o shrink
    clippedM = quantizeMercatorFeature(clippedM, gridDecimals);
    try {
        clippedM = turf.buffer(clippedM, 0, { units: "meters" });
    } catch { }

    // volta p/ WGS84 + limpeza final
    let clippedW = turf.toWgs84(clippedM);
    try {
        clippedW = turf.cleanCoords(clippedW);
    } catch { }

    return clippedW;
}

// ----------------------------------------------------------------------------
// Versão antiga útil em alguns casos (mantida)
// ----------------------------------------------------------------------------
export function clipToAoiWgs(polyWgs, aoiWgs, epsilonMeters = 0.02) {
    const maskF = asPolyFeatureWgs(polyWgs);
    const aoiF = asPolyFeatureWgs(aoiWgs);
    if (!maskF) return null;
    if (!aoiF) return maskF; // sem AOI válida, retorna original

    // Projeção métrica (sem simplificar)
    const maskM = toMercatorPolyLoose(maskF);
    const aoiM = toMercatorPolyLoose(aoiF);
    if (!maskM || !aoiM) return null;

    // “cura” topologia
    let m0 = maskM,
        a0 = aoiM;
    try {
        m0 = turf.buffer(maskM, 0, { units: "meters" });
    } catch { }
    try {
        a0 = turf.buffer(aoiM, 0, { units: "meters" });
    } catch { }

    // encolhe levemente a máscara para não sobrar “rebarba” na borda da AOI
    if (epsilonMeters && epsilonMeters > 0) {
        const eps = Math.max(0.01, Math.min(epsilonMeters, 0.2));
        try {
            m0 = turf.buffer(m0, -eps, { units: "meters" });
        } catch { }
    }

    const A = toPcMultiPolygon(m0);
    const B = toPcMultiPolygon(a0);
    if (!A.length || !B.length) return null;

    let inter = null;
    try {
        inter = pc.intersection(A, B);
    } catch {
        inter = null;
    }
    if (!inter || !inter.length) return null;

    // volta p/ WGS84 + limpeza forte
    let clippedM = pcResultToFeature(inter); // métrico
    let clippedW = turf.toWgs84(clippedM); // WGS84
    try {
        clippedW = turf.buffer(clippedW, 0, { units: "meters" });
    } catch { }
    try {
        clippedW = turf.cleanCoords(clippedW);
    } catch { }

    // garantia final: intersect Turf com AOI WGS
    try {
        const final = turf.intersect(clippedW, aoiF);
        if (final) return turf.cleanCoords(final);
    } catch { }

    return clippedW;
}

/**
 * Clipping teimoso:
 *  - normaliza (Mercator + quantização)
 *  - pc.intersection
 *  - se vazio, expande AOI (0.05m, 0.2m, 1m) e tenta de novo
 *  - por fim, faz intersect final com AOI original (sem expandir)
 */
export function clipToAoiWgsTeimoso(polyWgs, aoiWgs, { gridDecimals = 1 } = {}) {
    const maskF = asPolyFeatureWgs(polyWgs);
    const aoiF = asPolyFeatureWgs(aoiWgs);
    if (!maskF) return null;
    if (!aoiF) return maskF;

    // Normaliza para métrico com a MESMA grade
    const maskM0 = normalizePolyToMercatorForPC(maskF, "mask", gridDecimals);
    const aoiM0 = normalizePolyToMercatorForPC(aoiF, "aoi", gridDecimals);

    const tryIntersect = (mM, aM) => {
        const A = toPcMultiPolygon(mM);
        const B = toPcMultiPolygon(aM);
        if (!A.length || !B.length) return null;
        try {
            const inter = pc.intersection(A, B);
            if (!inter || !inter.length) return null;
            let out = pcResultToFeature(inter);
            try { out = turf.buffer(out, 0, { units: "meters" }); } catch { }
            return out || null;
        } catch {
            return null;
        }
    };

    const attempts = [0, 0.05, 0.2, 1.0]; // m
    let clippedM = null;

    for (const grow of attempts) {
        let aoiM = aoiM0;
        if (grow > 0) {
            try { aoiM = turf.buffer(aoiM0, grow, { units: "meters" }); } catch { }
            try { aoiM = turf.buffer(aoiM, 0, { units: "meters" }); } catch { }
        }
        clippedM = tryIntersect(maskM0, aoiM);
        if (clippedM && turf.area(clippedM) > 1e-9) break;
    }

    if (!clippedM) return null;

    // Limita com a AOI original (métrica) para não sobrar "inchaço"
    let clippedLimitedM = clippedM;
    try {
        const fin = turf.intersect(clippedM, aoiM0);
        if (fin) clippedLimitedM = turf.buffer(fin, 0, { units: "meters" });
    } catch { }

    // Volta p/ WGS + limpeza
    let clippedW = turf.toWgs84(clippedLimitedM);
    try { clippedW = turf.cleanCoords(clippedW); } catch { }
    return clippedW;
}

/**
 * Fallback final: interseção Martinez diretamente em WGS84 (planar),
 * apenas forçando orientação/fechamento. Útil quando projeção/buffer
 * “matam” a geometria por tangência/ruído.
 */
export function clipToAoiWgs_PlanarNoProj(polyWgs, aoiWgs) {
    const maskF = asPolyFeatureWgs(polyWgs);
    const aoiF = asPolyFeatureWgs(aoiWgs);
    if (!maskF) return null;
    if (!aoiF) return maskF;

    const mFix = orientAndCloseWgs(maskF);
    const aFix = orientAndCloseWgs(aoiF);

    const A = toPcMultiPolygon(mFix); // aqui estamos usando lon/lat “como se” fossem XY
    const B = toPcMultiPolygon(aFix);
    if (!A.length || !B.length) return null;

    try {
        const inter = pc.intersection(A, B);
        if (!inter || !inter.length) return null;
        let clipped = pcResultToFeature(inter);
        try { clipped = turf.cleanCoords(clipped); } catch { }
        return clipped || null; // já está em WGS
    } catch {
        return null;
    }
}




/** Interseção específica p/ máscara de rua ∩ AOI (alias do robusto). */
export function clipStreetMaskToAOI_WGS(streetMaskWgs, aoiWgs, epsilon = 0.2) {
    return clipToAoiWgsRobusto(streetMaskWgs, aoiWgs, {
        gridDecimals: 1,
        shrinkMeters: Math.max(0.05, Math.min(epsilon, 1.0)),
    });
}

// ----------------------------------------------------------------------------
// AV − União(cortes) (robusto, em métrico)
// ----------------------------------------------------------------------------

/** União de uma lista de cortes (WGS84) → Feature em Mercator. */
export function unionCortesMercator(cortesList) {
    if (!cortesList?.length) return null;
    try {
        const mpList = cortesList
            .map((c) => toMercatorPolySafe(c, "corte"))
            .map((fm) => toPcMultiPolygon(fm))
            .filter((mp) => mp && mp.length);
        if (!mpList.length) return null;
        let acc = mpList[0];
        for (let i = 1; i < mpList.length; i++) acc = pc.union(acc, mpList[i]);
        return pcResultToFeature(acc); // Mercator
    } catch {
        // fallback Turf
        try {
            const polys = cortesList.map((c) => toMercatorPolySafe(c, "corte"));
            let u = polys[0];
            for (let i = 1; i < polys.length; i++)
                u = turf.union(u, polys[i]) || u;
            return u;
        } catch {
            return null;
        }
    }
}

/** Diferença tolerante AV_M − cortes_M (ambos em Métrico). */
export function differenceSafe(avM, cortesUnionM) {
    if (!cortesUnionM) return avM;
    const EPS = [
        0, 0.02, -0.02, 0.05, -0.05, 0.1, -0.1, 0.2, -0.2, 0.5, -0.5, 1, -1, 2,
        -2,
    ];
    for (const e of EPS) {
        try {
            const cAdj =
                e === 0
                    ? cortesUnionM
                    : turf.buffer(cortesUnionM, e, { units: "meters" });
            const d = turf.difference(avM, cAdj);
            if (d) return d;
        } catch { }
    }
    try {
        const A = toPcMultiPolygon(avM);
        const B = toPcMultiPolygon(cortesUnionM);
        const out = pc.difference(A, B);
        return pcResultToFeature(out);
    } catch {
        return null;
    }
}

/**
 * Pipeline completo para AV − União(cortes) (entradas WGS84).
 * Retorna: { recortado, areaRestanteM2, areaCortesM2, uniaoCortes }
 */
export function cutAreaVerde(avWgs84, cortesWgs84 = [], epsilonMeters = 0.05) {
    if (!avWgs84) throw new Error("AV ausente");
    let av = ensureFeaturePolygon(avWgs84, "av");
    const cortes = (cortesWgs84 || []).map((c) =>
        ensureFeaturePolygon(c, "corte")
    );

    // Projeta p/ métrico
    let avM = toMercatorPolySafe(av, "av");
    const cortesM = cortes
        .map((c) => toMercatorPolySafe(c, "corte"))
        .filter(Boolean);

    // “Curas” iniciais
    try {
        avM = turf.buffer(avM, 0, { units: "meters" });
    } catch { }

    // União dos cortes
    let cortesU = null;
    if (cortesM.length) {
        try {
            let acc = toPcMultiPolygon(cortesM[0]);
            for (let i = 1; i < cortesM.length; i++) {
                acc = pc.union(acc, toPcMultiPolygon(cortesM[i]));
            }
            cortesU = pcResultToFeature(acc);
        } catch {
            // fallback: turf.union sequencial
            try {
                let u = cortesM[0];
                for (let i = 1; i < cortesM.length; i++)
                    u = turf.union(u, cortesM[i]) || u;
                cortesU = u;
            } catch {
                cortesU = null;
            }
        }
        if (epsilonMeters && cortesU) {
            const eps = Math.max(0.01, Math.min(epsilonMeters, 0.5));
            try {
                cortesU = turf.buffer(cortesU, eps, { units: "meters" });
            } catch { }
        }
    }

    // Diferença AV - União(cortes)
    const diffM = differenceSafe(avM, cortesU);
    if (!diffM) {
        // Se falhar, retorna AV original em WGS como “recortado” (não alterado)
        const avBack = turf.toWgs84(avM);
        return {
            recortado: avBack,
            areaRestanteM2: turf.area(avBack),
            areaCortesM2: cortesU ? turf.area(turf.toWgs84(cortesU)) : 0,
            uniaoCortes: cortesU ? turf.toWgs84(cortesU) : null,
        };
    }

    // Volta p/ WGS84 e limpa
    let recortado = turf.toWgs84(diffM);
    try {
        recortado = turf.cleanCoords(recortado);
    } catch { }

    let uniaoCortes = cortesU ? turf.toWgs84(cortesU) : null;
    try {
        if (uniaoCortes) uniaoCortes = turf.cleanCoords(uniaoCortes);
    } catch { }

    const areaRestanteM2 = turf.area(recortado);
    const areaCortesM2 = uniaoCortes ? turf.area(uniaoCortes) : 0;

    return { recortado, areaRestanteM2, areaCortesM2, uniaoCortes };
}

// ----------------------------------------------------------------------------
// Utilidades adicionais úteis no fluxo
// ----------------------------------------------------------------------------

/** Área em m² de um Feature Polygon/MultiPolygon. */
export function getArea(feature) {
    if (!feature) return 0;
    return turf.area(feature);
}

/** Interseção (pode retornar null). */
export function getIntersection(polyA, polyB) {
    if (!polyA || !polyB) return null;
    return turf.intersect(polyA, polyB);
}

/** Diferença A - B (pode retornar null). */
export function getDifference(polyA, polyB) {
    if (!polyA || !polyB) return null;
    return turf.difference(polyA, polyB);
}

/** Buffer em metros (polígonos). */
export function bufferPolygon(feature, distanceMeters) {
    if (!feature) return null;
    return turf.buffer(feature, distanceMeters, { units: "meters" });
}

/** FeatureCollection a partir de lista de features. */
export function makeFeatureCollection(features = []) {
    return turf.featureCollection(features.filter(Boolean));
}
