// src/pages/geoman/geoUtils.js
import * as turf from "@turf/turf";
import * as pc from "polygon-clipping";

// --- Debug ---
export const DEBUG = true;
export function DBG(tag, obj) {
    if (!DEBUG) return;
    const ts = new Date().toISOString();
    try { obj !== undefined ? console.log(`[GEOMAN][${ts}] ${tag}:`, obj) : console.log(`[GEOMAN][${ts}] ${tag}`); }
    catch { console.log(`[GEOMAN][${ts}] ${tag} <cant-serialize>`); }
}

// --- Geo helpers puros ---
export function featureWithOriginal(f, originFmt = "geojson") {
    const g = JSON.parse(JSON.stringify(f));
    g.properties = g.properties || {};
    g.properties._orig = { fmt: originFmt, geom: JSON.parse(JSON.stringify(f.geometry)) };
    g.geometry = JSON.parse(JSON.stringify(f.geometry));
    return g;
}

export function fitToFeatures(map, featuresOrFC) {
    if (!map) return;
    const fc = featuresOrFC?.type === "FeatureCollection"
        ? featuresOrFC
        : { type: "FeatureCollection", features: [].concat(featuresOrFC || []) };
    if (!fc.features?.length) return;
    const b = turf.bbox(fc);
    const bounds = [[b[1], b[0]], [b[3], b[2]]];
    try { map.fitBounds(bounds, { padding: [30, 30] }); } catch { }
}

// Converte L.Polygon/MultiPolygon -> Feature WGS84
export function layerToWgs84Feature(layer, roleLabel = "geom") {
    try {
        if (!layer?.getLatLngs) return null;
        const ll = layer.getLatLngs();
        const close = (ring) => {
            if (!ring?.length) return ring;
            const a = ring[0], b = ring[ring.length - 1];
            if (a.lng !== b.lng || a.lat !== b.lat) return [...ring, a];
            return ring;
        };
        const ringToCoords = (ring) => close(ring).map((p) => [p.lng, p.lat]);

        // Polygon => [rings][LatLng]
        if (Array.isArray(ll) && ll.length && Array.isArray(ll[0]) && !Array.isArray(ll[0][0])) {
            const coords = ll.map(ringToCoords);
            return turf.feature({ type: "Polygon", coordinates: coords }, { _role: roleLabel });
        }
        // MultiPolygon => [polys][rings][LatLng]
        if (Array.isArray(ll) && Array.isArray(ll[0]) && Array.isArray(ll[0][0])) {
            const coords = ll.map((poly) => poly.map(ringToCoords));
            return turf.feature({ type: "MultiPolygon", coordinates: coords }, { _role: roleLabel });
        }
        return null;
    } catch { return null; }
}

export function ensureFeaturePolygon(input, label = "geom") {
    if (!input) throw new Error(`${label} ausente`);
    const feat = input.type === "Feature" ? input : turf.feature(input);
    const g = feat.geometry;
    if (!g) throw new Error(`${label} sem geometry`);
    if (g.type === "Polygon") return turf.cleanCoords(feat);
    if (g.type === "MultiPolygon") {
        const polys = g.coordinates.map((rings) => turf.polygon(rings));
        let union = polys[0];
        for (let i = 1; i < polys.length; i++) { try { union = turf.union(union, polys[i]) || union; } catch { } }
        return turf.cleanCoords(union);
    }
    throw new Error(`${label} precisa ser Polygon/MultiPolygon (atual: ${g.type})`);
}

export function ensureClosedPolygon(poly) {
    const p = JSON.parse(JSON.stringify(poly));
    if (p.geometry?.type !== "Polygon") return p;
    p.geometry.coordinates = p.geometry.coordinates.map((ring) => {
        if (!ring.length) return ring;
        const [fx, fy] = ring[0]; const [lx, ly] = ring[ring.length - 1];
        if (fx !== lx || fy !== ly) return [...ring, [fx, fy]];
        return ring;
    });
    return p;
}

export function snapWgs(f, precision = 6) {
    try { return turf.truncate(turf.cleanCoords(f), { precision, mutate: false }); } catch { return f; }
}
export function rewindOuter(f) {
    try { return turf.rewind(f, { reverse: true }); } catch { return f; }
}

export function toMercatorPolySafe(f, label) {
    const clean = ensureClosedPolygon(ensureFeaturePolygon(rewindOuter(snapWgs(f)), label));
    let fm = turf.toMercator(clean);
    try { fm = turf.buffer(fm, 0, { units: "meters" }); } catch { }
    try { fm = turf.simplify(fm, { tolerance: 0.01, highQuality: true }); } catch { }
    return fm;
}

const closeRing = (ring) => {
    if (!ring?.length) return ring;
    const a = ring[0], b = ring[ring.length - 1];
    if (a[0] !== b[0] || a[1] !== b[1]) return [...ring, [a[0], a[1]]];
    return ring;
};
export function toPcMultiPolygon(fMerc) {
    const g = fMerc?.geometry;
    if (!g) return [];
    if (g.type === "Polygon") return [g.coordinates.map(closeRing)];
    if (g.type === "MultiPolygon") return g.coordinates.map((poly) => poly.map(closeRing));
    return [];
}
export function pcResultToFeature(mp) {
    if (!mp || !mp.length) return null;
    const norm = mp.map((poly) => poly.map(closeRing));
    try { return norm.length === 1 ? turf.polygon(norm[0]) : turf.multiPolygon(norm); } catch { return null; }
}

// União de cortes (Mercator)
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
        try {
            const polys = cortesList.map((c) => toMercatorPolySafe(c, "corte"));
            let u = polys[0];
            for (let i = 1; i < polys.length; i++) u = turf.union(u, polys[i]) || u;
            return u;
        } catch { return null; }
    }
}

export function differenceSafe(avM, cortesUnionM) {
    if (!cortesUnionM) return avM;
    const EPS = [0, 0.02, -0.02, 0.05, -0.05, 0.1, -0.1, 0.2, -0.2, 0.5, -0.5, 1, -1, 2, -2];
    for (const e of EPS) {
        try {
            const cAdj = e === 0 ? cortesUnionM : turf.buffer(cortesUnionM, e, { units: "meters" });
            const d = turf.difference(avM, cAdj);
            if (d) return d;
        } catch { }
    }
    try {
        const A = toPcMultiPolygon(avM);
        const B = toPcMultiPolygon(cortesUnionM);
        const out = pc.difference(A, B);
        return pcResultToFeature(out);
    } catch { return null; }
}

export function extendLineString(lineFeature, meters = 0) {
    if (!lineFeature?.geometry?.coordinates?.length) return lineFeature;
    const coords = [...lineFeature.geometry.coordinates];
    if (coords.length < 2) return lineFeature;
    const start = coords[0], next = coords[1];
    const prev = coords[coords.length - 2], end = coords[coords.length - 1];
    const bStart = turf.bearing(turf.point(next), turf.point(start));
    const bEnd = turf.bearing(turf.point(prev), turf.point(end));
    const newStart = turf.destination(turf.point(start), meters / 1000, bStart, { units: "kilometers" }).geometry.coordinates;
    const newEnd = turf.destination(turf.point(end), meters / 1000, bEnd, { units: "kilometers" }).geometry.coordinates;
    return { ...lineFeature, geometry: { ...lineFeature.geometry, coordinates: [newStart, ...coords.slice(1, -1), newEnd] } };
}
