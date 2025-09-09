// GeomanLoteador.jsx — múltiplas AVs + múltiplos cortes, edição garantida pós-add,
// abrir projeto/overlays/ruas/lotes preservados + recálculo em tempo real robusto
import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import {
    MapContainer,
    TileLayer,
    LayersControl,
    GeoJSON,
    useMap,
    Pane,
} from "react-leaflet";
import L from "leaflet";

import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import "@geoman-io/leaflet-geoman-free"; // L.PM
import * as turf from "@turf/turf";
import * as pc from "polygon-clipping";
import useAxios from "../../utils/useAxios";

// ---------- Constantes ----------
const OVERLAY_ID = "loteamento_geoman";
const OVERLAY_COLOR = "#7e57c2";
const token = import.meta.env.VITE_MAPBOX_TOKEN?.trim();

// ---------- Debug helper ----------
const DEBUG = true;
function DBG(tag, obj = undefined) {
    if (!DEBUG) return;
    const ts = new Date().toISOString();
    try { obj !== undefined ? console.log(`[GEOMAN][${ts}] ${tag}:`, obj) : console.log(`[GEOMAN][${ts}] ${tag}`); }
    catch { console.log(`[GEOMAN][${ts}] ${tag} <cant-serialize>`); }
}

// ---------- Helpers básicos ----------
function featureWithOriginal(f, originFmt = "geojson") {
    const g = JSON.parse(JSON.stringify(f));
    g.properties = g.properties || {};
    g.properties._orig = { fmt: originFmt, geom: JSON.parse(JSON.stringify(f.geometry)) };
    g.geometry = JSON.parse(JSON.stringify(f.geometry));
    return g;
}

// Converte um L.Polygon/L.MultiPolygon *vivo* para Feature WGS84
function layerToWgs84Feature(layer, roleLabel = "geom") {
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
    } catch {
        return null;
    }
}

function fitToFeatures(map, featuresOrFC) {
    if (!map) return;
    const fc =
        featuresOrFC?.type === "FeatureCollection"
            ? featuresOrFC
            : { type: "FeatureCollection", features: [].concat(featuresOrFC || []) };
    if (!fc.features || !fc.features.length) return;
    const b = turf.bbox(fc);
    const bounds = [[b[1], b[0]], [b[3], b[2]]];
    try { map.fitBounds(bounds, { padding: [30, 30] }); } catch { }
}
function ensureFeaturePolygon(input, label = "geom") {
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
function ensureClosedPolygon(poly) {
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
// snapping/rewind
function snapWgs(f, precision = 6) { try { return turf.truncate(turf.cleanCoords(f), { precision, mutate: false }); } catch { return f; } }
function rewindOuter(f) { try { return turf.rewind(f, { reverse: true }); } catch { return f; } }
function toMercatorPolySafe(f, label) {
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
function toPcMultiPolygon(fMerc) {
    const g = fMerc?.geometry;
    if (!g) return [];
    if (g.type === "Polygon") return [g.coordinates.map(closeRing)];
    if (g.type === "MultiPolygon") return g.coordinates.map((poly) => poly.map(closeRing));
    return [];
}
function pcResultToFeature(mp) {
    if (!mp || !mp.length) return null;
    const norm = mp.map((poly) => poly.map(closeRing));
    try { return norm.length === 1 ? turf.polygon(norm[0]) : turf.multiPolygon(norm); } catch { return null; }
}

// Tiles
function TilesWithFallback() {
    const hasToken = !!token;
    return (
        <LayersControl position="topright">
            {hasToken && (
                <>
                    <LayersControl.BaseLayer checked name="Mapbox Híbrido (Satélite + Ruas)">
                        <TileLayer
                            url={`https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/{z}/{x}/{y}{r}?access_token=${token}`}
                            tileSize={512} zoomOffset={-1} maxZoom={22}
                            attribution="&copy; Mapbox &copy; OpenStreetMap" detectRetina
                        />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="Mapbox Satélite puro">
                        <TileLayer
                            url={`https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/{z}/{x}/{y}{r}?access_token=${token}`}
                            tileSize={512} zoomOffset={-1} maxZoom={22}
                            attribution="&copy; Mapbox &copy; OpenStreetMap" detectRetina
                        />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="Mapbox Ruas">
                        <TileLayer
                            url={`https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}{r}?access_token=${token}`}
                            tileSize={512} zoomOffset={-1} maxZoom={22}
                            attribution="&copy; Mapbox &copy; OpenStreetMap" detectRetina
                        />
                    </LayersControl.BaseLayer>
                </>
            )}
            <LayersControl.BaseLayer checked={!hasToken} name="Esri World Imagery (fallback)">
                <TileLayer
                    url="https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    attribution="Tiles &copy; Esri"
                />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="OSM (ruas - fallback)">
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            </LayersControl.BaseLayer>
        </LayersControl>
    );
}

// ---------- MapEffects (Geoman integrado) ----------
function MapEffects({ drawMode, drawNonce, onCreateFeature, onMapReady }) {
    const map = useMap();
    const controlsReadyRef = useRef(false);

    useEffect(() => {
        if (!controlsReadyRef.current) {
            map.pm.addControls({
                position: "topleft",
                drawMarker: false, drawCircle: false, drawCircleMarker: false, drawText: false,
                drawPolyline: true, drawRectangle: false, drawPolygon: true,
                cutPolygon: false, editMode: true, dragMode: true, rotateMode: false, removalMode: true,
            });
            try { map.pm.setGlobalOptions({ allowSelfIntersection: false, snappable: true, snapDistance: 20 }); } catch { }
            controlsReadyRef.current = true;
            onMapReady?.(map);
        }

        const handleCreate = (e) => {
            const gj = e.layer.toGeoJSON();
            try { onCreateFeature(drawMode, gj, map, e.layer); }
            catch (err) { console.error("[onCreateFeature] EXCEPTION:", err); }
            finally {
                // manter desenho contínuo para AV e Corte
                if (drawMode !== "areaVerde" && drawMode !== "corteLayer") {
                    try { map.pm.disableDraw(); } catch { }
                }
                try { e.layer.remove(); } catch { }
            }
        };

        map.on("pm:create", handleCreate);
        return () => { map.off("pm:create", handleCreate); };
    }, [map, onCreateFeature, drawMode, onMapReady]);

    useEffect(() => {
        try { map.pm.disableDraw(); } catch { }
        if (drawMode === "areaVerde") {
            map.pm.enableDraw("Polygon", { snappable: true, snapDistance: 20, continueDrawing: true });
        } else if (drawMode === "corteLayer") {
            map.pm.enableDraw("Polygon", { snappable: true, snapDistance: 20, continueDrawing: true });
        } else if (drawMode === "rua") {
            map.pm.enableDraw("Line", { snappable: true, snapDistance: 20 });
        }
    }, [map, drawMode, drawNonce]);

    return null;
}

// ---------- Component global para rAF + eventos do mapa ----------
function PmRealtimeRecalc({ getRecalc }) {
    const map = useMap();
    const raf = useRef(null);
    const schedule = () => {
        if (raf.current) return;
        raf.current = requestAnimationFrame(() => {
            raf.current = null;
            try { getRecalc()?.(); } catch { }
        });
    };

    useEffect(() => {
        if (!map) return;
        const events = [
            "pm:markerdrag", "pm:markerdragend",
            "pm:edit", "pm:editend",
            "pm:vertexadded", "pm:vertexremoved",
            "pm:snap", "pm:unsnap",
            "pm:create", "pm:remove", "pm:drag", "pm:dragend",
        ];
        events.forEach((ev) => map.on(ev, schedule));
        return () => {
            events.forEach((ev) => map.off(ev, schedule));
            if (raf.current) cancelAnimationFrame(raf.current);
        };
    }, [map]);

    return null;
}

// ---------- Estender linhas (compatibilidade) ----------
function extendLineString(lineFeature, meters = 0) {
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

// ---------- Componente principal ----------
export default function GeomanLoteador() {
    const axiosAuth = useAxios();
    const mapRef = useRef(null);

    // refs / índices de layers
    const avLayerByUid = useRef(new Map());     // uid -> L.Polygon (cada AV)
    const corteLayerByUid = useRef(new Map());  // uid -> L.Polygon (cada Corte)
    const seqRef = useRef({ av: 0, corte: 0, loteavel: 0 });
    const recalcRef = useRef(() => { });

    // rAF para recálculo leve durante arrasto (local do componente)
    const recalcRAF = useRef(null);
    const scheduleRecalc = useCallback(() => {
        if (recalcRAF.current) return;
        recalcRAF.current = requestAnimationFrame(() => {
            recalcRAF.current = null;
            try { recalcRef.current?.(); } catch { }
        });
    }, []);
    useEffect(() => () => { if (recalcRAF.current) cancelAnimationFrame(recalcRAF.current); }, []);

    // Projetos
    const [projetos, setProjetos] = useState([]);
    const [projetoSel, setProjetoSel] = useState("");

    // Camadas criadas
    const [aoi, setAoi] = useState(null);
    const [areasVerdes, setAreasVerdes] = useState([]); // múltiplas AVs
    const [cortes, setCortes] = useState([]);           // múltiplos cortes
    const [areaLoteavel, setAreaLoteavel] = useState(null);
    const [ruas, setRuas] = useState([]);
    const [lotes, setLotes] = useState([]);

    // Overlays externos
    const [extrasByOverlay, setExtrasByOverlay] = useState({});

    // Métricas (totais)
    const [avAreaM2, setAvAreaM2] = useState(0);
    const [cortesAreaM2, setCortesAreaM2] = useState(0);
    const [cortePct, setCortePct] = useState(0);
    const [percentPermitido, setPercentPermitido] = useState(20);

    // Visibilidade
    const [visible, setVisible] = useState({
        aoi: true, areasVerdes: true, loteavel: true, cortes: true, ruas: true, lotes: true, overlays: {},
    });

    // UI / ferramentas
    const [drawMode, setDrawMode] = useState("none");
    const [drawNonce, setDrawNonce] = useState(0);
    const [extendMeters, setExtendMeters] = useState(20);

    // ---------- Fetch projetos ----------
    useEffect(() => {
        (async () => {
            try {
                const { data: list } = await axiosAuth.get("projetos/");
                setProjetos(list);
            } catch (e) {
                console.error("[fetch projetos] erro:", e);
                alert("Erro ao carregar projetos (faça login).");
            }
        })();
    }, []);

    // ---------- Overlays do backend ----------
    function pushExtrasFromFC(fc) {
        const feats = fc?.features || [];
        const extras = feats.filter((f) => {
            const role = f.properties?.role;
            return !["aoi", "area_verde", "rua", "lote"].includes(role || "");
        });
        if (!extras.length) return;
        setExtrasByOverlay((prev) => {
            const next = { ...prev };
            for (const f of extras) {
                const oid = f.properties?.__overlay_id || "overlay_desconhecido";
                const color = f.properties?.__color;
                if (!next[oid]) next[oid] = { features: [], color };
                next[oid].features.push(featureWithOriginal(f, "geojson"));
                if (color && !next[oid].color) next[oid].color = color;
            }
            return next;
        });
    }
    function loadFixedRolesFromFC(fc) {
        const feats = fc?.features || [];

        // Carrega TODAS as AVs do projeto
        const avFeats = feats.filter(
            (f) => f.properties?.role === "area_verde" && ["Polygon", "MultiPolygon"].includes(f.geometry?.type)
        );
        if (avFeats.length) {
            setAreasVerdes((prev) => {
                if (prev.length) return prev; // evita duplicar quando vários overlays
                const list = avFeats.map((f) => {
                    const avNorm = ensureFeaturePolygon(f, "areaVerdeInitLoad");
                    const withSeq = featureWithOriginal(avNorm, "geojson");
                    withSeq.properties._uid = ++seqRef.current.av;
                    return withSeq;
                });
                // calcula área total inicial
                try {
                    const total = list.reduce((acc, it) => acc + turf.area(ensureFeaturePolygon(it, "av")), 0);
                    setAvAreaM2(total);
                } catch { }
                return list;
            });
        }

        // Ruas
        const ruasFeats = feats.filter((f) => f.properties?.role === "rua" && ["LineString", "MultiLineString"].includes(f.geometry?.type));
        if (ruasFeats.length) setRuas((prev) => [...prev, ...ruasFeats.map((f) => featureWithOriginal(f, "geojson"))]);

        // Lotes
        const lotPolys = feats.filter((f) => f.properties?.role === "lote" && ["Polygon", "MultiPolygon"].includes(f.geometry?.type));
        if (lotPolys.length) setLotes((prev) => [...prev, ...lotPolys.map((f) => featureWithOriginal(f, "geojson"))]);
    }

    async function abrirProjeto(id) {
        if (!Number.isFinite(id)) return;
        setProjetoSel(id);

        // reset
        setAoi(null);
        setAreasVerdes([]); avLayerByUid.current = new Map();
        setCortes([]); corteLayerByUid.current = new Map();
        setAreaLoteavel(null);
        setRuas([]); setLotes([]); setExtrasByOverlay({});
        seqRef.current = { av: 0, corte: 0, loteavel: 0 };
        setAvAreaM2(0); setCortesAreaM2(0); setCortePct(0);

        try {
            const { data: summary } = await axiosAuth.get(`projetos/${id}/map/summary/`);
            const acc = [];

            if (summary?.aoi) {
                const aoiFeat = featureWithOriginal({ type: "Feature", geometry: summary.aoi }, "geojson");
                setAoi(aoiFeat); acc.push(aoiFeat);
            }

            const overlaysList = (summary?.overlays || []).filter((o) => (o?.count || 0) > 0);
            setVisible((prev) => ({ ...prev, overlays: overlaysList.reduce((accv, o) => ((accv[o.overlay_id] = true), accv), {}) }));

            for (const o of overlaysList) {
                const { data: fc } = await axiosAuth.get(`projetos/${id}/features/`, {
                    params: { overlay_id: o.overlay_id, simplified: true },
                    headers: { "Content-Type": undefined },
                });
                if (fc?.type === "FeatureCollection") {
                    loadFixedRolesFromFC(fc);
                    pushExtrasFromFC(fc);
                    acc.push(...(fc.features || []));
                }
            }

            if (mapRef.current && acc.length) fitToFeatures(mapRef.current, { type: "FeatureCollection", features: acc });
            scheduleRecalc();
        } catch (e) {
            console.error("[abrirProjeto] erro:", e);
            alert("Não foi possível abrir o projeto.");
        }
    }

    // ---------- Cálculo em tempo real (sem interseção) ----------
    function layerToWgs84FeatureSafe(layer, label) {
        try { return layerToWgs84Feature(layer, label); } catch { return null; }
    }
    function recomputePreview() {
        try {
            // 1) Soma AVs usando geometria VIVA quando disponível
            let somaAV = 0;
            let algumAvVivo = false;
            avLayerByUid.current.forEach((layer) => {
                const live = layerToWgs84FeatureSafe(layer, "av-live");
                if (live) {
                    somaAV += turf.area(ensureFeaturePolygon(live, "av-live"));
                    algumAvVivo = true;
                }
            });
            if (!algumAvVivo) {
                somaAV = areasVerdes.reduce((acc, av) => acc + turf.area(ensureFeaturePolygon(av, "av-state")), 0);
            }

            // 2) Soma Cortes com geometria viva
            let somaCortes = 0;
            let algumCorteVivo = false;
            corteLayerByUid.current.forEach((layer) => {
                const live = layerToWgs84FeatureSafe(layer, "corte-live");
                if (live) {
                    somaCortes += turf.area(ensureFeaturePolygon(live, "corte-live"));
                    algumCorteVivo = true;
                }
            });
            if (!algumCorteVivo) {
                somaCortes = cortes.reduce((acc, c) => acc + turf.area(ensureFeaturePolygon(c, "corte-state")), 0);
            }

            const pct = somaAV > 0 ? (somaCortes / somaAV) * 100 : 0;
            setAvAreaM2(somaAV);
            setCortesAreaM2(somaCortes);
            setCortePct(pct);
        } catch (e) {
            DBG("recomputePreview fail", e);
        }
    }
    useEffect(() => {
        recalcRef.current = () => { try { recomputePreview(); } catch { } };
    });

    // Sincroniza a geometria editada do layer para o estado (apenas ao final da edição)
    const syncLayerToState = useCallback((kind, uid, layer) => {
        try {
            const liveFeat = layerToWgs84Feature(layer, `${kind}-live`);
            if (!liveFeat) return;
            const updated = featureWithOriginal(liveFeat, "live");
            updated.properties = { ...(updated.properties || {}), _uid: uid };

            if (kind === "av") {
                setAreasVerdes(prev => prev.map(it => (it?.properties?._uid === uid ? updated : it)));
            } else if (kind === "corte") {
                setCortes(prev => prev.map(it => (it?.properties?._uid === uid ? updated : it)));
            }
        } catch { }
    }, []);

    useEffect(() => { recomputePreview(); }, [areasVerdes, cortes, percentPermitido]);

    // ---------- União de cortes e diferença segura ----------
    function unionCortesMercator(cortesList) {
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
    function differenceSafe(avM, cortesUnionM) {
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

    // ---------- Gerar Área Loteável: união( AV_i − união(cortes) ) ----------
    function gerarAreaLoteavel() {
        if (!areasVerdes.length) { alert("Desenhe ao menos uma Área Verde antes de gerar."); return; }
        try {
            // áreas vivas
            const avListWgs = areasVerdes.map((av) => {
                const uid = av?.properties?._uid;
                const layer = avLayerByUid.current.get(uid);
                const gj = layer?.toGeoJSON?.();
                const feat = gj
                    ? (gj.type === "Feature" ? gj : (gj.type === "FeatureCollection" && gj.features?.[0]) ? gj.features[0] : null)
                    : av;
                return feat;
            }).filter(Boolean);

            const cortesListWgs = cortes.map((c) => {
                const uid = c?.properties?._uid;
                const layer = corteLayerByUid.current.get(uid);
                const gj = layer?.toGeoJSON?.();
                const feat = gj
                    ? (gj.type === "Feature" ? gj : (gj.type === "FeatureCollection" && gj.features?.[0]) ? gj.features[0] : null)
                    : c;
                return feat;
            }).filter(Boolean);

            // base para checagem do limite
            const baseArea = avListWgs.reduce((acc, f) => acc + turf.area(ensureFeaturePolygon(f, "av-WGS84")), 0);

            const avListM = avListWgs.map((f) => toMercatorPolySafe(f, "av"));
            const cortesUnionM = cortesListWgs.length ? unionCortesMercator(cortesListWgs) : null;

            // diferença por AV e depois união
            let loteavelM = null;
            for (const avM of avListM) {
                const diff = differenceSafe(avM, cortesUnionM);
                if (!diff) continue;
                loteavelM = !loteavelM ? diff : (turf.union(loteavelM, diff) || loteavelM);
            }
            if (!loteavelM) {
                // se não sobrou nada, ainda assim validar limite
                const removed = baseArea; // 100%
                const perc = baseArea > 0 ? (removed / baseArea) * 100 : 0;
                const limite = parseFloat(percentPermitido) || 0;
                if (perc > limite + 1e-6) {
                    alert(`Cortes excedem o limite (${limite.toFixed(1)}%). Tentou remover ${removed.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m² (${perc.toFixed(2)}%).`);
                    return;
                }
                setAreaLoteavel(null);
                return;
            }

            const loteavelW = turf.toWgs84(loteavelM);
            const newArea = turf.area(ensureFeaturePolygon(loteavelW, "diff-WGS84"));
            const removed = Math.max(0, baseArea - newArea);
            const perc = baseArea > 0 ? (removed / baseArea) * 100 : 0;

            const limite = parseFloat(percentPermitido) || 0;
            if (perc > limite + 1e-6) {
                alert(`Cortes excedem o limite (${limite.toFixed(1)}%). Tentou remover ${removed.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m² (${perc.toFixed(2)}%).`);
                return;
            }

            const next = featureWithOriginal(loteavelW, "difference");
            next.properties._uid = ++seqRef.current.loteavel;
            setAreaLoteavel(next); // NÃO altera as AVs originais
        } catch (err) {
            DBG("[gerarAreaLoteavel] erro", err);
            alert("Falha ao gerar a área loteável. Veja o console para detalhes.");
        }
    }

    // ---------- Ações UI ----------
    function onExtendRuas() {
        const extended = ruas.map((r) => extendLineString(r, extendMeters));
        setRuas(extended);
    }

    // ---------- Styles ----------
    const excedeu = cortePct > (parseFloat(percentPermitido) || 0) + 1e-6;
    const avStyle = {
        color: excedeu ? "#ff4d4f" : "#007a4d",
        fillColor: excedeu ? "#ff4d4f" : "#41d686",
        fillOpacity: 0.45,
        weight: 3,
        opacity: 1,
    };
    const corteStyle = { color: "#e11d48", fillColor: "#fca5a5", fillOpacity: 0.35, weight: 2, dashArray: "6 3", opacity: 1 };
    const loteavelStyle = { color: "#1f6feb", fillColor: "#9ecbff", fillOpacity: 0.35, weight: 3, opacity: 1 };
    const lotStyle = { color: "#8e44ad", fillOpacity: 0.2, weight: 1, opacity: 1 };
    const ruaStyle = { color: "#333", weight: 3, opacity: 1 };
    const extraStyle = (f, defaultColor = "#ff9800") => {
        const c = f?.properties?.__color || defaultColor;
        const isLine = f?.geometry?.type?.includes("LineString");
        return isLine ? { color: c, weight: 2, opacity: 1 } : { color: c, fillOpacity: 0.18, weight: 1.5, opacity: 1 };
    };

    // ---------- UI overlays externos ----------
    const overlayKeys = useMemo(() => Object.keys(extrasByOverlay), [extrasByOverlay]);
    useEffect(() => {
        if (!overlayKeys.length) return;
        setVisible((prev) => {
            const next = { ...prev, overlays: { ...(prev.overlays || {}) } };
            overlayKeys.forEach((k) => { if (next.overlays[k] === undefined) next.overlays[k] = true; });
            return next;
        });
    }, [overlayKeys]);

    // ---------- Render ----------
    return (
        <div className="w-full h-full relative">
            {/* Painel */}
            <div className="absolute z-[1000] bottom-10 left-2 bg-white/40 rounded-xl shadow p-3 space-y-3 max-w-[1080px]">
                {/* Abrir projeto */}
                <div className="flex items-center gap-2">
                    <select
                        className="border p-2 rounded w-full"
                        value={projetoSel || ""}
                        onChange={(e) => { const idNum = Number(e.target.value); if (Number.isFinite(idNum)) abrirProjeto(idNum); }}
                    >
                        <option value="">Abrir projeto salvo…</option>
                        {projetos.map((p) => (<option key={p.id} value={p.id}>{p.name || `Projeto #${p.id}`}</option>))}
                    </select>
                </div>

                {/* Ferramentas */}
                <div className="grid grid-cols-5 gap-2">
                    <button
                        onClick={() => { setDrawMode("areaVerde"); setDrawNonce((n) => n + 1); }}
                        className={`px-3 py-2 rounded ${drawMode === "areaVerde" ? "bg-green-600 text-white" : "bg-gray-100"}`}
                    >
                        Criar Área Verde
                    </button>
                    <button
                        onClick={() => { setDrawMode("corteLayer"); setDrawNonce((n) => n + 1); }}
                        className={`px-3 py-2 rounded ${drawMode === "corteLayer" ? "bg-rose-600 text-white" : "bg-gray-100"}`}
                    >
                        Criar Corte
                    </button>
                    <button
                        onClick={gerarAreaLoteavel}
                        className="px-3 py-2 rounded bg-blue-700 text-white"
                        title="Gerar Área Loteável (união(AVs − união(cortes))) sem alterar as AVs"
                    >
                        Gerar Área Loteável
                    </button>
                    <button
                        onClick={() => { setCortes([]); corteLayerByUid.current = new Map(); setCortesAreaM2(0); setCortePct(0); scheduleRecalc(); }}
                        className="px-3 py-2 rounded bg-gray-200" title="Limpar Cortes"
                    >
                        Limpar Cortes
                    </button>
                    <div className="flex items-center gap-2 justify-end">
                        <span className="text-sm">Permitido (%)</span>
                        <input
                            type="number" className="border p-1 rounded w-20"
                            value={percentPermitido}
                            onChange={(e) => setPercentPermitido(parseFloat(e.target.value || "0"))}
                        />
                    </div>
                </div>

                {/* Métricas (totais) */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    <div className="text-sm bg-gray-50 border rounded p-2">
                        <div className="text-gray-600">Área Verde Total (m²)</div>
                        <div className="text-lg font-semibold">
                            {avAreaM2.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                        </div>
                    </div>
                    <div className="text-sm bg-gray-50 border rounded p-2">
                        <div className="text-gray-600">Soma dos Cortes (m²)</div>
                        <div className="text-lg font-semibold">
                            {cortesAreaM2.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                        </div>
                    </div>
                    <div className="text-sm bg-gray-50 border rounded p-2">
                        <div className="text-gray-600"># AVs / # Cortes</div>
                        <div className="text-lg font-semibold">{areasVerdes.length} / {cortes.length}</div>
                    </div>
                    <div className={`text-sm border rounded p-2 ${excedeu ? "bg-red-50 border-red-300" : "bg-green-50 border-green-300"}`}>
                        <div className={`text-gray-600`}>% Cortes ÷ AVs</div>
                        <div className={`text-lg font-semibold ${excedeu ? "text-red-700" : "text-green-700"}`}>
                            {cortePct.toFixed(2)}%
                        </div>
                    </div>
                </div>

                {/* Estender ruas (opcional) */}
                <div className="flex items-center gap-2">
                    <span className="text-sm">Estender ruas (m)</span>
                    <input
                        type="number"
                        className="border p-1 rounded w-24"
                        value={extendMeters}
                        onChange={(e) => setExtendMeters(parseFloat(e.target.value || "0"))}
                    />
                    <button onClick={onExtendRuas} className="px-3 py-2 rounded bg-black text-white">Aplicar</button>
                </div>
            </div>

            {/* MAPA */}
            <div style={{ height: "100vh", width: "100%" }}>
                <MapContainer
                    center={[-14, -55]}
                    zoom={4}
                    style={{ height: "100%", width: "100%" }}
                    whenCreated={(m) => { mapRef.current = m; setTimeout(() => recalcRef.current?.(), 0); }}
                >
                    <TilesWithFallback />

                    {/* Panes */}
                    <Pane name="pane-extras" style={{ zIndex: 500 }} />
                    <Pane name="pane-aoi" style={{ zIndex: 520 }} />
                    <Pane name="pane-avs" style={{ zIndex: 580 }} />
                    <Pane name="pane-loteavel" style={{ zIndex: 585 }} />
                    <Pane name="pane-cortes" style={{ zIndex: 590 }} />
                    <Pane name="pane-ruas" style={{ zIndex: 540 }} />
                    <Pane name="pane-lotes" style={{ zIndex: 535 }} />

                    <PmRealtimeRecalc getRecalc={() => recalcRef.current} />

                    <MapEffects
                        drawMode={drawMode}
                        drawNonce={drawNonce}
                        onMapReady={(m) => { mapRef.current = m; }}
                        onCreateFeature={(mode, gj) => {
                            DBG("pm:create mode", mode);
                            if (mode === "areaVerde") {
                                const f = featureWithOriginal(turf.feature(gj.geometry), "leaflet");
                                f.properties = f.properties || {}; f.properties._uid = ++seqRef.current.av;
                                setAreasVerdes((prev) => [...prev, f]);
                                if (mapRef.current) fitToFeatures(mapRef.current, f);
                                scheduleRecalc();
                                return; // continueDrawing true
                            }
                            if (mode === "corteLayer") {
                                const f = featureWithOriginal(turf.feature(gj.geometry), "leaflet");
                                f.properties = f.properties || {}; f.properties._uid = ++seqRef.current.corte;
                                setCortes((prev) => [...prev, f]);
                                if (mapRef.current) fitToFeatures(mapRef.current, f);
                                scheduleRecalc();
                                return; // continueDrawing true
                            }
                            if (mode === "rua") {
                                if (gj.geometry.type === "LineString" || gj.geometry.type === "MultiLineString") {
                                    const clean = featureWithOriginal(turf.cleanCoords(turf.feature(gj.geometry)), "leaflet");
                                    setRuas((prev) => [...prev, clean]);
                                }
                                return;
                            }
                        }}
                    />

                    {/* AOI */}
                    {aoi && visible.aoi && (
                        <GeoJSON
                            pane="pane-aoi"
                            key="aoi"
                            data={aoi}
                            style={() => ({ color: "#3498db", fillOpacity: 0.08, weight: 2, opacity: 1 })}
                            eventHandlers={{ add: (e) => { try { e.target.options.pmIgnore = true; } catch { } } }}
                        />
                    )}

                    {/* Áreas Verdes (cada uma editável; registrar por UID) */}
                    {visible.areasVerdes && areasVerdes.map((av, i) => (
                        <GeoJSON
                            pane="pane-avs"
                            key={`av-${av?.properties?._uid ?? i}`}
                            data={av}
                            style={() => avStyle}
                            onEachFeature={(feature, layer) => {
                                try {
                                    const uid = av?.properties?._uid ?? i;
                                    layer._avUid = uid;

                                    // habilita edição quando a camada entrar no mapa
                                    layer.once("add", () => {
                                        setTimeout(() => {
                                            try {
                                                layer.pm?.enable?.({ allowSelfIntersection: false, snappable: true, snapDistance: 20 });
                                                layer.options.pmIgnore = false;
                                                layer.bringToFront?.();
                                                scheduleRecalc();
                                            } catch { }
                                        }, 0);
                                    });

                                    // registra layer
                                    avLayerByUid.current.set(uid, layer);

                                    // callbacks
                                    const recalcLive = () => scheduleRecalc();
                                    const syncEnd = () => { syncLayerToState("av", uid, layer); scheduleRecalc(); };

                                    // eventos live
                                    layer.on("pm:markerdrag", recalcLive);
                                    layer.on("pm:snap", recalcLive);
                                    layer.on("pm:unsnap", recalcLive);
                                    layer.on("pm:edit", recalcLive);
                                    layer.on("pm:vertexadded", recalcLive);
                                    layer.on("pm:vertexremoved", recalcLive);
                                    layer.on("pm:drag", recalcLive);

                                    // fim da edição
                                    layer.on("pm:markerdragend", syncEnd);
                                    layer.on("pm:editend", syncEnd);
                                    layer.on("pm:dragend", syncEnd);

                                    // remoção
                                    const onPmRemove = () => {
                                        avLayerByUid.current.delete(uid);
                                        setAreasVerdes((prev) => prev.filter((it) => (it.properties?._uid) !== uid));
                                        scheduleRecalc();
                                    };
                                    layer.on("pm:remove", onPmRemove);
                                    layer.on("remove", () => { avLayerByUid.current.delete(uid); });
                                } catch { }
                            }}
                        />
                    ))}

                    {/* Área Loteável (resultado) */}
                    {areaLoteavel && visible.loteavel && (
                        <GeoJSON
                            pane="pane-loteavel"
                            key={`loteavel-${areaLoteavel?.properties?._uid ?? "0"}`}
                            data={areaLoteavel}
                            style={() => loteavelStyle}
                            eventHandlers={{ add: (e) => { try { e.target.options.pmIgnore = true; } catch { } } }}
                        />
                    )}

                    {/* Cortes (cada um editável; registrar por UID) */}
                    {visible.cortes && cortes.map((c, i) => (
                        <GeoJSON
                            pane="pane-cortes"
                            key={`corte-${c?.properties?._uid ?? i}`}
                            data={c}
                            style={() => corteStyle}
                            onEachFeature={(feature, layer) => {
                                try {
                                    const uid = c?.properties?._uid ?? i;
                                    layer._corteUid = uid;

                                    layer.once("add", () => {
                                        setTimeout(() => {
                                            try {
                                                layer.pm?.enable?.({ allowSelfIntersection: false, snappable: true, snapDistance: 20 });
                                                layer.options.pmIgnore = false;
                                                layer.bringToFront?.();
                                                scheduleRecalc();
                                            } catch { }
                                        }, 0);
                                    });

                                    // registra
                                    corteLayerByUid.current.set(uid, layer);

                                    // callbacks
                                    const recalcLive = () => scheduleRecalc();
                                    const syncEnd = () => { syncLayerToState("corte", uid, layer); scheduleRecalc(); };

                                    // eventos live
                                    layer.on("pm:markerdrag", recalcLive);
                                    layer.on("pm:snap", recalcLive);
                                    layer.on("pm:unsnap", recalcLive);
                                    layer.on("pm:edit", recalcLive);
                                    layer.on("pm:vertexadded", recalcLive);
                                    layer.on("pm:vertexremoved", recalcLive);
                                    layer.on("pm:drag", recalcLive);

                                    // fim da edição
                                    layer.on("pm:markerdragend", syncEnd);
                                    layer.on("pm:editend", syncEnd);
                                    layer.on("pm:dragend", syncEnd);

                                    // remoção
                                    const onPmRemove = () => {
                                        corteLayerByUid.current.delete(uid);
                                        setCortes((prev) => prev.filter((it) => (it.properties?._uid) !== uid));
                                        scheduleRecalc();
                                    };
                                    layer.on("pm:remove", onPmRemove);
                                    layer.on("remove", () => { corteLayerByUid.current.delete(uid); });
                                } catch { }
                            }}
                        />
                    ))}

                    {/* Ruas */}
                    {visible.ruas && ruas.map((r, i) => (
                        <GeoJSON pane="pane-ruas" key={`rua-${i}`} data={r} style={() => ruaStyle} />
                    ))}

                    {/* Lotes */}
                    {visible.lotes && lotes.map((l, i) => (
                        <GeoJSON pane="pane-lotes" key={`lot-${i}`} data={l} style={() => lotStyle} />
                    ))}

                    {/* Extras do backend (overlays) */}
                    {Object.keys(extrasByOverlay).map((k) => {
                        if (!visible.overlays?.[k]) return null;
                        const feats = extrasByOverlay[k]?.features || [];
                        const color = extrasByOverlay[k]?.color || "#ff9800";
                        return feats.map((f, i) => (
                            <GeoJSON pane="pane-extras" key={`extra-${k}-${i}`} data={f} style={() => extraStyle(f, color)} />
                        ));
                    })}
                </MapContainer>
            </div>
        </div>
    );
}
