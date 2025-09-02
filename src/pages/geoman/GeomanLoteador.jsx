// GeomanLoteador.jsx
import React, { useEffect, useRef, useState, useMemo } from "react";
import {
    MapContainer,
    TileLayer,
    LayersControl,
    GeoJSON,
    useMap,
    Pane,
    CircleMarker,
    Polygon,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import "@geoman-io/leaflet-geoman-free"; // L.PM
import * as turf from "@turf/turf";
import { kml as toGeoJSONKML } from "@tmcw/togeojson";
import useAxios from "../../utils/useAxios";

// ---------- Constantes ----------
const OVERLAY_ID = "loteamento_geoman";
const OVERLAY_COLOR = "#7e57c2";
const token = import.meta.env.VITE_MAPBOX_TOKEN?.trim();

// ---------- Helpers básicos ----------
function dropZMForLeaflet(geom) {
    return turf.truncate(geom, { precision: 6, coordinates: 2 });
}
function featureWithOriginal(f, originFmt = "geojson") {
    // NÃO altere as coordenadas aqui (nada de truncate/mercator/etc.)
    const g = JSON.parse(JSON.stringify(f));
    g.properties = g.properties || {};
    g.properties._orig = { fmt: originFmt, geom: JSON.parse(JSON.stringify(f.geometry)) };
    g.geometry = JSON.parse(JSON.stringify(f.geometry));
    return g;
}
function fcWithOriginal(fc, originFmt = "geojson") {
    return {
        type: "FeatureCollection",
        features: (fc.features || []).map((f) => featureWithOriginal(f, originFmt)),
    };
}
async function readKMLFileAsGeoJSON(file) {
    const text = await file.text();
    const dom = new DOMParser().parseFromString(text, "text/xml");
    return toGeoJSONKML(dom);
}
function addOverlayMeta(feature, overlayId = OVERLAY_ID, color = OVERLAY_COLOR) {
    const f = JSON.parse(JSON.stringify(feature));
    f.properties = { ...(f.properties || {}), __overlay_id: overlayId, __color: color };
    return f;
}
// Fit bounds helper
function fitToFeatures(map, featuresOrFC) {
    if (!map) return;
    const fc =
        featuresOrFC.type === "FeatureCollection"
            ? featuresOrFC
            : { type: "FeatureCollection", features: featuresOrFC };
    if (!fc.features || !fc.features.length) return;
    const b = turf.bbox(fc);
    const bounds = [
        [b[1], b[0]],
        [b[3], b[2]],
    ];
    console.log("[fitToFeatures] bbox:", b, "-> bounds:", bounds);
    try {
        map.fitBounds(bounds, { padding: [30, 30] });
    } catch (err) {
        console.warn("[fitToFeatures] fitBounds falhou:", err);
    }
}

// ---------- Normalização / Geometria segura ----------
function ensureFeaturePolygon(input, label = "geom") {
    if (!input) throw new Error(`${label} ausente`);
    const feat = input.type === "Feature" ? input : turf.feature(input);
    const g = feat.geometry;
    if (!g) throw new Error(`${label} sem geometry`);

    if (g.type === "Polygon") {
        const cleaned = turf.cleanCoords(feat);
        return turf.rewind(cleaned, { reverse: false }); // externo CCW
    }
    if (g.type === "MultiPolygon") {
        const polys = g.coordinates.map((rings) => turf.polygon(rings));
        let union = polys[0];
        for (let i = 1; i < polys.length; i++) {
            try {
                union = turf.union(union, polys[i]) || union;
            } catch { }
        }
        const cleaned = turf.cleanCoords(union);
        return turf.rewind(cleaned, { reverse: false });
    }
    throw new Error(`${label} precisa ser Polygon/MultiPolygon (atual: ${g.type})`);
}
function ensureClosedPolygon(poly) {
    const p = JSON.parse(JSON.stringify(poly));
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
function planarBufferMeters(feature, meters) {
    const fm = turf.toMercator(feature);
    let bm = null;
    try {
        bm = turf.buffer(fm, meters, { units: "meters" });
    } catch {
        bm = fm;
    }
    return turf.toWgs84(bm);
}
function dissolveFC(features) {
    if (!features?.length) return null;
    let cur = features[0];
    for (let i = 1; i < features.length; i++) {
        try {
            cur = turf.union(cur, features[i]) || cur;
        } catch { }
    }
    return cur;
}
function normalizePolygonForOps(input, label = "geom") {
    let base = ensureFeaturePolygon(input, label);
    base = ensureClosedPolygon(base);
    let fc = null;
    try {
        fc = turf.unkinkPolygon(base);
    } catch {
        fc = { type: "FeatureCollection", features: [base] };
    }
    let merged = dissolveFC(fc.features) || base;
    const clean = turf.cleanCoords(merged);
    return turf.rewind(clean, { reverse: false });
}

// ---------- Ops planas (WebMercator) ----------
function planarIntersect(a, b) {
    try {
        const aM = turf.toMercator(a);
        const bM = turf.toMercator(b);
        const interM = turf.intersect(aM, bM);
        return interM ? turf.toWgs84(interM) : null;
    } catch (err) {
        console.warn("[planarIntersect] erro:", err);
        return null;
    }
}
function planarDifference(a, b) {
    try {
        const aM = turf.toMercator(a);
        const bM = turf.toMercator(b);
        const diffM = turf.difference(aM, bM);
        return diffM ? turf.toWgs84(diffM) : null;
    } catch (err) {
        console.warn("[planarDifference] erro:", err);
        return null;
    }
}

// ---------- Transformações auxiliares ----------
function rotateCoords(coords, angleRad, origin) {
    const [ox, oy] = origin,
        cosA = Math.cos(angleRad),
        sinA = Math.sin(angleRad);
    return coords.map(([x, y]) => {
        const dx = x - ox,
            dy = y - oy;
        return [ox + dx * cosA - dy * sinA, oy + dx * sinA + dy * cosA];
    });
}

// ---------- Lotes (heurística segura) ----------
function generateLotsHeuristicSafe(aoiFeature, lotWidthM, lotHeightM, minKeepAreaM2 = 5) {
    if (!aoiFeature) return [];
    const aoiPoly = ensureFeaturePolygon(aoiFeature, "AOI");
    const aoiWgs = ensureClosedPolygon(aoiPoly);
    const aoiM = turf.toMercator(aoiWgs);

    const angleDeg = (function dominantAngleSafe(geom) {
        const asLine = turf.polygonToLine(geom);
        const feats = asLine.type === "FeatureCollection" ? asLine.features : [asLine];
        let best = { len: 0, angle: 0 };
        feats.forEach((f) => {
            const coords = f.geometry.coordinates;
            for (let i = 1; i < coords.length; i++) {
                const a = coords[i - 1],
                    b = coords[i];
                const dist = turf.distance(turf.point(a), turf.point(b), { units: "meters" });
                if (dist > best.len)
                    best = { len: dist, angle: turf.bearing(turf.point(a), turf.point(b)) };
            }
        });
        return best.angle;
    })(aoiWgs);

    const bboxM = turf.bbox(aoiM);
    const origin = [(bboxM[0] + bboxM[2]) / 2, (bboxM[1] + bboxM[3]) / 2];
    const angRad = -(angleDeg * Math.PI) / 180;
    console.log("[lots] angleDeg:", angleDeg, "origin:", origin, "bboxM:", bboxM);

    const aoiRot = JSON.parse(JSON.stringify(aoiM));
    aoiRot.geometry = {
        type: "Polygon",
        coordinates: aoiM.geometry.coordinates.map((r) => rotateCoords(r, angRad, origin)),
    };

    const bb = turf.bbox(aoiRot);
    const lots = [];
    for (let x = bb[0]; x < bb[2]; x += lotWidthM) {
        for (let y = bb[1]; y < bb[3]; y += lotHeightM) {
            const rect = turf.polygon([
                [
                    [x, y],
                    [x + lotWidthM, y],
                    [x + lotWidthM, y + lotHeightM],
                    [x, y + lotHeightM],
                    [x, y],
                ],
            ]);
            let inter = null;
            try {
                inter = turf.intersect(aoiRot, rect) || null;
            } catch (err) {
                console.warn("[lots] intersect erro:", err);
                inter = null;
            }
            if (inter) {
                const area = turf.area(inter);
                if (area >= minKeepAreaM2) {
                    const w = JSON.parse(JSON.stringify(inter));
                    w.geometry = {
                        type: "Polygon",
                        coordinates: inter.geometry.coordinates.map((r) =>
                            rotateCoords(r, -angRad, origin)
                        ),
                    };
                    lots.push(turf.toWgs84(w));
                }
            }
        }
    }
    console.log("[lots] generated:", lots.length);
    return lots;
}

// ---------- Extensão de linhas ----------
function extendLineString(lineFeature, meters = 0) {
    if (!lineFeature?.geometry?.coordinates?.length) return lineFeature;
    const coords = [...lineFeature.geometry.coordinates];
    if (coords.length < 2) return lineFeature;

    const start = coords[0];
    const next = coords[1];
    const prev = coords[coords.length - 2];
    const end = coords[coords.length - 1];

    const bStart = turf.bearing(turf.point(next), turf.point(start));
    const bEnd = turf.bearing(turf.point(prev), turf.point(end));

    const newStart = turf.destination(turf.point(start), meters / 1000, bStart, {
        units: "kilometers",
    }).geometry.coordinates;
    const newEnd = turf.destination(turf.point(end), meters / 1000, bEnd, {
        units: "kilometers",
    }).geometry.coordinates;

    return {
        ...lineFeature,
        geometry: {
            ...lineFeature.geometry,
            coordinates: [newStart, ...coords.slice(1, -1), newEnd],
        },
    };
}

// ---------- Tiles ----------
function TilesWithFallback() {
    const hasToken = !!token;
    return (
        <LayersControl position="topright">
            {hasToken && (
                <>
                    <LayersControl.BaseLayer checked name="Mapbox Híbrido (Satélite + Ruas)">
                        <TileLayer
                            url={`https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/{z}/{x}/{y}{r}?access_token=${token}`}
                            tileSize={512}
                            zoomOffset={-1}
                            maxZoom={22}
                            attribution="&copy; Mapbox &copy; OpenStreetMap"
                            detectRetina
                        />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="Mapbox Satélite puro">
                        <TileLayer
                            url={`https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/{z}/{x}/{y}{r}?access_token=${token}`}
                            tileSize={512}
                            zoomOffset={-1}
                            maxZoom={22}
                            attribution="&copy; Mapbox &copy; OpenStreetMap"
                            detectRetina
                        />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="Mapbox Ruas">
                        <TileLayer
                            url={`https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}{r}?access_token=${token}`}
                            tileSize={512}
                            zoomOffset={-1}
                            maxZoom={22}
                            attribution="&copy; Mapbox &copy; OpenStreetMap"
                            detectRetina
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
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution="&copy; OpenStreetMap"
                />
            </LayersControl.BaseLayer>
        </LayersControl>
    );
}

// ---------- MapEffects (Geoman integrado) ----------
function MapEffects({ drawMode, onCreateFeature, onMapReady }) {
    const map = useMap();
    const controlsReadyRef = useRef(false);

    // Setup único: toolbar + listener
    useEffect(() => {
        if (!controlsReadyRef.current) {
            console.log("[MapEffects] init geoman controls");
            map.pm.addControls({
                position: "topleft",
                drawMarker: false,
                drawCircle: false,
                drawCircleMarker: false,
                drawText: false,
                drawPolyline: true,
                drawRectangle: true,
                drawPolygon: true,
                cutPolygon: true,
                editMode: true,
                dragMode: true,
                rotateMode: false,
                removalMode: true,
            });
            try {
                // evita polígonos auto-intersectantes
                map.pm.setGlobalOptions({ allowSelfIntersection: false });
            } catch { }
            controlsReadyRef.current = true;
            if (onMapReady) onMapReady(map);
        }

        const handleCreate = (e) => {
            const gj = e.layer.toGeoJSON();
            console.log("[pm:create] drawMode:", drawMode, "geomType:", gj?.geometry?.type, gj);
            onCreateFeature(drawMode, gj, map);
            try {
                e.layer.remove(); // limpa o rascunho
            } catch { }
            map.pm.disableDraw();
        };

        map.on("pm:create", handleCreate);
        return () => {
            map.off("pm:create", handleCreate);
        };
    }, [map, onCreateFeature, drawMode, onMapReady]);

    // Ativa a ferramenta correta quando drawMode muda
    useEffect(() => {
        console.log("[MapEffects] set drawMode:", drawMode);
        try {
            map.pm.disableDraw();
        } catch { }
        if (drawMode === "aoi" || drawMode === "areaVerde" || drawMode === "corte") {
            map.pm.enableDraw("Polygon", { snappable: true, snapDistance: 20 });
        } else if (drawMode === "rua") {
            map.pm.enableDraw("Line", { snappable: true, snapDistance: 20 });
        }
    }, [map, drawMode]);

    return null;
}

// ---------- Componente principal ----------
export default function GeomanLoteador() {
    const axiosAuth = useAxios();
    const mapRef = useRef(null);
    const initialAreaVerdeRef = useRef(null);
    const avSeqRef = useRef(0); // key para forçar re-render

    // Projetos
    const [projetos, setProjetos] = useState([]);
    const [projetoSel, setProjetoSel] = useState("");

    // Camadas criadas na tela
    const [aoi, setAoi] = useState(null);
    const [areaVerde, setAreaVerde] = useState(null);
    const [cortes, setCortes] = useState([]);
    const [ruas, setRuas] = useState([]);
    const [lotes, setLotes] = useState([]);

    // Debug AV
    const [debugAV, setDebugAV] = useState(false);
    const [avBBox, setAvBBox] = useState(null); // Feature Polygon
    const [avCentroid, setAvCentroid] = useState(null); // [lat, lng]
    const [avOuterRing, setAvOuterRing] = useState(null); // coords Leaflet para fallback <Polygon>

    // Camadas externas (agrupadas por overlay_id)
    const [extrasByOverlay, setExtrasByOverlay] = useState({});

    // Visibilidade
    const [visible, setVisible] = useState({
        aoi: true,
        areaVerde: true,
        ruas: true,
        lotes: true,
        overlays: {}, // { [overlayId]: true/false }
    });

    // UI / ferramentas
    const [drawMode, setDrawMode] = useState("none"); // "aoi" | "areaVerde" | "rua" | "corte"
    const [percentPermitido, setPercentPermitido] = useState(20);
    const [percentCortado, setPercentCortado] = useState(0);
    const [extendMeters, setExtendMeters] = useState(20);
    const percentExceeded =
        Number.isFinite(percentCortado) && percentCortado > percentPermitido + 1e-6;

    // -------- Carregar lista de projetos (sua forma) --------
    useEffect(() => {
        (async () => {
            try {
                const { data: list } = await axiosAuth.get("projetos/");
                setProjetos(list);
                console.log("[fetch projetos] ok:", list?.length);
            } catch (e) {
                console.error("[fetch projetos] erro:", e);
                alert("Erro ao carregar projetos (faça login).");
            }
        })();
    }, []); // sem deps

    // -------- Helpers de overlays do backend --------
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
        const aoiFeat = feats.find(
            (f) => f.properties?.role === "aoi" && ["Polygon", "MultiPolygon"].includes(f.geometry?.type)
        );
        if (aoiFeat) setAoi((prev) => prev || featureWithOriginal(aoiFeat, "geojson"));

        const avFeat = feats.find(
            (f) =>
                f.properties?.role === "area_verde" &&
                ["Polygon", "MultiPolygon"].includes(f.geometry?.type)
        );
        if (avFeat) {
            const avNorm = normalizePolygonForOps(avFeat, "areaVerdeInitLoad");
            initialAreaVerdeRef.current = turf.area(avNorm);
            const withSeq = featureWithOriginal(avNorm, "geojson");
            withSeq.properties._uid = ++avSeqRef.current;
            setAreaVerde((prev) => prev || withSeq);
            computeAVDebug(withSeq);
        }

        const ruasFeats = feats.filter(
            (f) =>
                f.properties?.role === "rua" &&
                ["LineString", "MultiLineString"].includes(f.geometry?.type)
        );
        if (ruasFeats.length)
            setRuas((prev) => [...prev, ...ruasFeats.map((f) => featureWithOriginal(f, "geojson"))]);

        const lotPolys = feats.filter(
            (f) =>
                f.properties?.role === "lote" &&
                ["Polygon", "MultiPolygon"].includes(f.geometry?.type)
        );
        if (lotPolys.length)
            setLotes((prev) => [...prev, ...lotPolys.map((f) => featureWithOriginal(f, "geojson"))]);
    }

    // -------- Abrir projeto (carrega overlays + fitBounds) --------
    async function abrirProjeto(id) {
        if (!Number.isFinite(id)) return;
        setProjetoSel(id);

        // reset
        setAoi(null);
        setAreaVerde(null);
        setCortes([]);
        setRuas([]);
        setLotes([]);
        setExtrasByOverlay({});
        setPercentCortado(0);
        initialAreaVerdeRef.current = null;
        avSeqRef.current = 0;
        setAvBBox(null);
        setAvCentroid(null);
        setAvOuterRing(null);

        try {
            console.log("[abrirProjeto] id:", id);
            const { data: summary } = await axiosAuth.get(`projetos/${id}/map/summary/`);
            console.log("[abrirProjeto] summary:", summary);
            const acc = [];

            if (summary?.aoi) {
                const aoiFeat = featureWithOriginal(
                    { type: "Feature", geometry: summary.aoi },
                    "geojson"
                );
                setAoi(aoiFeat);
                acc.push({ type: "Feature", geometry: summary.aoi });
            }

            const overlaysList = (summary?.overlays || []).filter((o) => (o?.count || 0) > 0);
            console.log("[abrirProjeto] overlaysList:", overlaysList);
            setVisible((prev) => ({
                ...prev,
                overlays: overlaysList.reduce((accv, o) => ((accv[o.overlay_id] = true), accv), {}),
            }));

            for (const o of overlaysList) {
                const { data: fc } = await axiosAuth.get(`projetos/${id}/features/`, {
                    params: { overlay_id: o.overlay_id, simplified: true },
                    headers: { "Content-Type": undefined },
                });
                console.log(
                    "[abrirProjeto] fetched overlay:",
                    o.overlay_id,
                    "features:",
                    fc?.features?.length
                );
                if (fc?.type === "FeatureCollection") {
                    loadFixedRolesFromFC(fc);
                    pushExtrasFromFC(fc);
                    acc.push(...(fc.features || []));
                }
            }

            if (mapRef.current && acc.length) {
                fitToFeatures(mapRef.current, { type: "FeatureCollection", features: acc });
            }
        } catch (e) {
            console.error("[geoman] abrirProjeto:", e?.response?.status, e?.response?.data || e);
            alert("Não foi possível abrir o projeto.");
        }
    }

    // -------- Importar KML (fitBounds depois) --------
    async function onImportKML(ev) {
        const file = ev.target.files?.[0];
        if (!file) return;
        console.log("[onImportKML] file:", file?.name, file?.size);
        const fc = await readKMLFileAsGeoJSON(file);
        const withOrig = fcWithOriginal(fc, "kml");
        console.log("[onImportKML] total features:", withOrig?.features?.length);

        const polys = withOrig.features
            .filter((f) => ["Polygon", "MultiPolygon"].includes(f.geometry?.type))
            .map((f) => ensureFeaturePolygon(f, "kml_poly"));

        const lines = withOrig.features
            .filter((f) => ["LineString", "MultiLineString"].includes(f.geometry?.type))
            .map((f) => featureWithOriginal(turf.cleanCoords(f), "kml"));

        console.log("[onImportKML] polys:", polys.length, "lines:", lines.length);

        if (!aoi && polys.length) {
            const newAoi = featureWithOriginal(polys[0], "kml");
            setAoi(newAoi);
            console.log(
                "[onImportKML] AOI set; area(m²):",
                turf.area(ensureFeaturePolygon(newAoi))
            );
        }
        if (lines.length) setRuas((prev) => [...prev, ...lines]);

        if (mapRef.current && (withOrig.features || []).length) {
            fitToFeatures(mapRef.current, withOrig);
        }
    }

    // -------- Debug AV helpers --------
    function computeAVDebug(avFeat) {
        try {
            const bbox = turf.bbox(avFeat);
            setAvBBox(turf.bboxPolygon(bbox));
            const cent = turf.center(avFeat).geometry.coordinates; // [lng,lat]
            setAvCentroid([cent[1], cent[0]]); // Leaflet [lat,lng]
            // outer ring -> Leaflet <Polygon> fallback
            if (avFeat.geometry?.type === "Polygon") {
                const ring = avFeat.geometry.coordinates[0] || [];
                setAvOuterRing(ring.map(([lng, lat]) => [lat, lng]));
            } else {
                setAvOuterRing(null);
            }
            console.log("[debugAV] bbox:", bbox, "centroid:", cent);
        } catch (e) {
            console.warn("[debugAV] compute fail:", e);
            setAvBBox(null);
            setAvCentroid(null);
            setAvOuterRing(null);
        }
    }

    // -------- Ações da UI --------
    function onExtendRuas() {
        const extended = ruas.map((r) => extendLineString(r, extendMeters));
        setRuas(extended);
        console.log("[onExtendRuas] applied meters:", extendMeters, "count:", extended.length);
    }

    function onGerarLotes() {
        if (!aoi) return alert("Desenhe/importe o polígono da área de loteamento (AOI)");
        const largura = parseFloat(document.getElementById("lotWidthM").value || "12");
        const altura = parseFloat(document.getElementById("lotHeightM").value || "25");
        console.log("[onGerarLotes] largura:", largura, "altura:", altura);
        try {
            const generated = generateLotsHeuristicSafe(
                aoi,
                largura,
                altura,
                Math.min(largura * altura * 0.4, 20)
            );
            setLotes(generated.map((f) => featureWithOriginal(f, "proc")));
            console.log("[onGerarLotes] lotes gerados:", generated.length);
        } catch (err) {
            console.error("[onGerarLotes] erro:", err);
            alert("Falha ao gerar lotes. Verifique se a AOI é um Polígono válido.");
        }
    }

    async function salvarLoteamento() {
        if (!projetoSel) return alert("Selecione um projeto.");
        if (!aoi) return alert("Desenhe/abra a AOI antes de salvar.");

        const feats = [];
        const add = (f, role) => {
            if (!f) return;
            const g = JSON.parse(JSON.stringify(f));
            g.properties = { ...(g.properties || {}), role };
            feats.push(addOverlayMeta(g));
        };
        add(aoi, "aoi");
        add(areaVerde, "area_verde");
        ruas.forEach((r) => add(r, "rua"));
        lotes.forEach((l) => add(l, "lote"));
        const fc = { type: "FeatureCollection", features: feats };

        try {
            const payload = {
                project_id: projetoSel,
                aoi: ensureFeaturePolygon(aoi, "AOI").geometry,
                overlays_raw: fc,
                replace_overlays: true,
                simplify: { lines: 0.00002, polygons: 0.00005 },
                format: "kmz",
                layers: {},
            };
            console.log("[salvarLoteamento] payload:", payload);
            await axiosAuth.post(`projetos/exportar/`, payload, { responseType: "arraybuffer" });
            alert("Loteamento salvo no overlay e KMZ exportado.");
        } catch (e) {
            console.error("[geoman] salvarLoteamento:", e?.response?.status, e?.response?.data || e);
            alert("Falha ao salvar (exportar_projeto).");
        }
    }

    async function deletarLoteamento() {
        if (!projetoSel) return;
        try {
            await axiosAuth.delete(`projetos/${projetoSel}/overlay/`, {
                params: { overlay_id: OVERLAY_ID },
            });
            alert("Overlay deletado.");
            setLotes([]); // mantém extras
        } catch (e) {
            console.error("[geoman] deletarOverlay:", e?.response?.status, e?.response?.data || e);
            alert("Falha ao deletar overlay.");
        }
    }

    // -------- Styles --------
    const aoiStyle = { color: "#3498db", fillOpacity: 0.08, weight: 2, opacity: 1 };
    const lotStyle = { color: "#8e44ad", fillOpacity: 0.2, weight: 1, opacity: 1 };
    const ruaStyle = { color: "#333", weight: 3, opacity: 1 };
    const areaVerdeStyle = {
        color: percentExceeded ? "#ff4d4f" : "#007a4d",
        fillColor: percentExceeded ? "#ff4d4f" : "#41d686",
        fillOpacity: 0.45,
        weight: 3,
        opacity: 1,
    };
    const corteStyle = { color: "#e11d48", fillOpacity: 0.15, weight: 2, dashArray: "6 3", opacity: 1 };
    const extraStyle = (f, defaultColor = "#ff9800") => {
        const c = f?.properties?.__color || defaultColor;
        const isLine = f?.geometry?.type?.includes("LineString");
        return isLine ? { color: c, weight: 2, opacity: 1 } : { color: c, fillOpacity: 0.18, weight: 1.5, opacity: 1 };
    };

    // -------- UI overlays externos --------
    const overlayKeys = useMemo(() => Object.keys(extrasByOverlay), [extrasByOverlay]);
    useEffect(() => {
        if (!overlayKeys.length) return;
        setVisible((prev) => {
            const next = { ...prev, overlays: { ...(prev.overlays || {}) } };
            overlayKeys.forEach((k) => {
                if (next.overlays[k] === undefined) next.overlays[k] = true;
            });
            return next;
        });
    }, [overlayKeys]);

    const prettyName = (k) =>
    ({
        lt_existente: "Linhas de Transmissão",
        rios_brasil: "Rios do Brasil",
        ferrovias: "Ferrovias",
        limites_federais: "Limites Federais",
        loteamento_geoman: "Loteamento (overlay)",
    }[k] || k);

    // -------- Quando AV muda, atualiza debug --------
    useEffect(() => {
        if (areaVerde) computeAVDebug(areaVerde);
    }, [areaVerde]);

    return (
        <div className="w-full h-full relative">
            {/* Painel */}
            <div className="absolute z-[1000] top-2 left-2 bg-white/95 rounded-xl shadow p-3 space-y-3 max-w-[760px]">
                {/* Linha: abrir projeto + importar KML */}
                <div className="flex items-center gap-2">
                    <select
                        className="border p-2 rounded w-full"
                        value={projetoSel || ""}
                        onChange={(e) => {
                            const idNum = Number(e.target.value);
                            if (!Number.isFinite(idNum)) return;
                            abrirProjeto(idNum);
                        }}
                    >
                        <option value="">Abrir projeto salvo…</option>
                        {projetos.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name || `Projeto #${p.id}`}
                            </option>
                        ))}
                    </select>
                    <label className="cursor-pointer bg-gray-100 border rounded px-3 py-2">
                        Importar KML
                        <input type="file" accept=".kml" className="hidden" onChange={onImportKML} />
                    </label>
                </div>

                {/* Ferramentas Geoman */}
                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => setDrawMode("aoi")}
                        className={`px-3 py-2 rounded ${drawMode === "aoi" ? "bg-blue-600 text-white" : "bg-gray-100"
                            }`}
                    >
                        Desenhar AOI
                    </button>
                    <button
                        onClick={() => setDrawMode("areaVerde")}
                        className={`px-3 py-2 rounded ${drawMode === "areaVerde" ? "bg-green-600 text-white" : "bg-gray-100"
                            }`}
                    >
                        Área Verde
                    </button>
                    <button
                        onClick={() => setDrawMode("rua")}
                        className={`px-3 py-2 rounded ${drawMode === "rua" ? "bg-gray-800 text-white" : "bg-gray-100"
                            }`}
                    >
                        Desenhar Rua
                    </button>
                    <button
                        onClick={() => setDrawMode("corte")}
                        className={`px-3 py-2 rounded ${drawMode === "corte" ? "bg-red-600 text-white" : "bg-gray-100"
                            }`}
                    >
                        Cortar Área Verde
                    </button>
                </div>

                {/* Percentual de corte */}
                <div className="flex items-center gap-2">
                    <label className="text-sm">Percentual permitido (%)</label>
                    <input
                        type="number"
                        className="border p-1 rounded w-20"
                        value={percentPermitido}
                        onChange={(e) => setPercentPermitido(parseFloat(e.target.value || "0"))}
                    />
                    <div
                        className={`text-sm px-2 py-1 rounded ${percentExceeded ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                            }`}
                    >
                        Cortado: {Number.isFinite(percentCortado) ? percentCortado.toFixed(1) : "0.0"}%
                    </div>

                    {/* Debug toggle */}
                    <label className="ml-auto flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={debugAV}
                            onChange={(e) => setDebugAV(e.target.checked)}
                        />
                        Debug AV (centro/bbox)
                    </label>
                </div>

                {/* Lotes + Estender ruas */}
                <div className="flex items-center gap-2">
                    <input id="lotWidthM" type="number" defaultValue={12} className="border p-1 rounded w-20" />
                    <span className="text-sm">Largura (m)</span>
                    <input id="lotHeightM" type="number" defaultValue={25} className="border p-1 rounded w-20" />
                    <span className="text-sm">Altura (m)</span>
                    <button onClick={onGerarLotes} className="ml-auto px-3 py-2 rounded bg-purple-600 text-white">
                        Gerar lotes (v1)
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-sm">Estender ruas (m)</span>
                    <input
                        type="number"
                        className="border p-1 rounded w-24"
                        value={extendMeters}
                        onChange={(e) => setExtendMeters(parseFloat(e.target.value || "0"))}
                    />
                    <button onClick={onExtendRuas} className="px-3 py-2 rounded bg-black text-white">
                        Aplicar
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={salvarLoteamento} className="px-3 py-2 rounded bg-emerald-600 text-white">
                        Salvar Loteamento
                    </button>
                    <button onClick={deletarLoteamento} className="px-3 py-2 rounded bg-rose-600 text-white">
                        Deletar Loteamento
                    </button>
                </div>
            </div>

            {/* MAPA */}
            <div style={{ height: "100vh", width: "100%" }}>
                <MapContainer center={[-14, -55]} zoom={4} style={{ height: "100%", width: "100%" }}>
                    <TilesWithFallback />

                    {/* Panes para garantir ordem/z-index */}
                    <Pane name="pane-extras" style={{ zIndex: 500 }} />
                    <Pane name="pane-aoi" style={{ zIndex: 620 }} />
                    <Pane name="pane-areaVerde" style={{ zIndex: 1000 }} />
                    <Pane name="pane-cortes" style={{ zIndex: 1010 }} />
                    <Pane name="pane-ruas" style={{ zIndex: 640 }} />
                    <Pane name="pane-lotes" style={{ zIndex: 635 }} />
                    <Pane name="pane-debug" style={{ zIndex: 1200 }} />

                    <MapEffects
                        drawMode={drawMode}
                        onMapReady={(m) => {
                            mapRef.current = m;
                        }}
                        onCreateFeature={(mode, gj /* GeoJSON */, map) => {
                            console.log("[onCreateFeature] mode:", mode, "type:", gj?.geometry?.type);
                            if (mode === "aoi") {
                                const f = featureWithOriginal(turf.feature(gj.geometry), "leaflet");
                                console.log("[aoi] area(m²):", turf.area(ensureFeaturePolygon(f, "aoi")));
                                setAoi(f);
                            } else if (mode === "areaVerde") {
                                const bruta = featureWithOriginal(turf.feature(gj.geometry), "leaflet");
                                // Normaliza só para medir a área base:
                                let normalizadaParaArea = null;
                                try { normalizadaParaArea = normalizePolygonForOps(bruta, "areaVerdeInit"); } catch { }
                                try {
                                    initialAreaVerdeRef.current = normalizadaParaArea
                                        ? turf.area(normalizadaParaArea)
                                        : turf.area(ensureFeaturePolygon(bruta, "areaVerdeInit"));
                                } catch { initialAreaVerdeRef.current = null; }
                                // No state, salve a geometria BRUTA (sem mexer nas coords):
                                const withSeq = JSON.parse(JSON.stringify(bruta));
                                withSeq.properties = withSeq.properties || {};
                                withSeq.properties._uid = ++avSeqRef.current;
                                setAreaVerde(withSeq);
                                setCortes([]);
                                setPercentCortado(0);
                                console.log("[areaVerde] sample coord[0]:", withSeq?.geometry?.coordinates?.[0]?.[0]);

                                if (mapRef.current) fitToFeatures(mapRef.current, withSeq);
                            } else if (mode === "rua") {
                                if (gj.geometry.type === "LineString" || gj.geometry.type === "MultiLineString") {
                                    const clean = featureWithOriginal(
                                        turf.cleanCoords(turf.feature(gj.geometry)),
                                        "leaflet"
                                    );
                                    setRuas((prev) => [...prev, clean]);
                                    console.log("[rua] appended; total:", ruas.length + 1);
                                }
                            } else if (mode === "corte" && areaVerde) {
                                try {
                                    const novoCorte = ensureClosedPolygon(
                                        featureWithOriginal(turf.feature(gj.geometry), "leaflet")
                                    );
                                    let verdePoly = ensureClosedPolygon(
                                        normalizePolygonForOps(areaVerde, "areaVerde")
                                    );
                                    let cortePoly = ensureClosedPolygon(
                                        normalizePolygonForOps(novoCorte, "corte")
                                    );

                                    const bboxV = turf.bbox(verdePoly);
                                    const bboxC = turf.bbox(cortePoly);
                                    const bi0 = turf.booleanIntersects(verdePoly, cortePoly);
                                    console.log(
                                        "[corte] bbox Verde:",
                                        bboxV,
                                        "bbox Corte:",
                                        bboxC,
                                        "booleanIntersects(WGS):",
                                        bi0
                                    );

                                    // Intersect WGS (+ epsilon se necessário)
                                    let inter = null;
                                    try {
                                        inter = turf.intersect(verdePoly, cortePoly) || null;
                                    } catch { }
                                    console.log("[corte] intersect WGS:", !!inter);
                                    if (!inter) {
                                        const corteEps = planarBufferMeters(cortePoly, 0.15);
                                        const bi1 = turf.booleanIntersects(verdePoly, corteEps);
                                        console.log("[corte] booleanIntersects com EPS:", bi1);
                                        try {
                                            inter = turf.intersect(verdePoly, corteEps) || null;
                                        } catch { }
                                        console.log("[corte] intersect WGS com EPS:", !!inter);
                                        if (!inter) cortePoly = corteEps;
                                    }
                                    if (!inter) {
                                        const interP = planarIntersect(verdePoly, cortePoly);
                                        console.log("[corte] intersect PLANAR:", !!interP);
                                        if (interP) inter = interP;
                                    }
                                    if (!inter) {
                                        console.log("[corte] sem interseção -> sem alteração");
                                        return;
                                    }

                                    // difference em plano
                                    let diff = planarDifference(verdePoly, cortePoly);
                                    if (!diff || !diff.geometry) {
                                        console.log("[corte] removeu tudo. setAreaVerde(null)");
                                        setAreaVerde(null);
                                        setCortes((prev) => [...prev, novoCorte]);
                                        setPercentCortado(100);
                                        return;
                                    }

                                    const A1 = turf.area(diff);
                                    const base0 =
                                        typeof initialAreaVerdeRef.current === "number" &&
                                            initialAreaVerdeRef.current > 0
                                            ? initialAreaVerdeRef.current
                                            : turf.area(verdePoly);
                                    const percAcumulado = ((base0 - A1) / Math.max(base0, 1e-9)) * 100;

                                    const diffSeq = featureWithOriginal(diff, "leaflet");
                                    diffSeq.properties = diffSeq.properties || {};
                                    diffSeq.properties._uid = ++avSeqRef.current;
                                    setAreaVerde(diffSeq);
                                    setCortes((prev) => [...prev, novoCorte]);
                                    setPercentCortado(percAcumulado);
                                    console.log(
                                        "[corte] A1(area após) m²:",
                                        A1,
                                        "base0:",
                                        base0,
                                        "percAcum:",
                                        percAcumulado,
                                        "uid:",
                                        diffSeq.properties._uid
                                    );
                                } catch (err) {
                                    console.error("Erro ao cortar área verde:", err);
                                    alert(
                                        "Falha ao cortar: verifique se o polígono não se auto-intersecta e sobrepõe a área verde."
                                    );
                                }
                            }
                        }}
                    />

                    {/* AOI */}
                    {aoi && visible.aoi && (
                        <GeoJSON
                            pane="pane-aoi"
                            key="aoi"
                            data={aoi}
                            style={() => aoiStyle}
                            eventHandlers={{
                                add: (e) => e?.target?.bringToFront?.(),
                            }}
                        />
                    )}

                    {/* Área Verde */}
                    {areaVerde && visible.areaVerde && (
                        <GeoJSON
                            pane="pane-areaVerde"
                            key={`av-${areaVerde?.properties?._uid ?? "0"}`}
                            data={areaVerde}
                            style={() => areaVerdeStyle}
                            eventHandlers={{
                                add: (e) => {
                                    console.log(
                                        "[GeoJSON ÁreaVerde] adicionada; uid:",
                                        areaVerde?.properties?._uid,
                                        "type:",
                                        areaVerde?.geometry?.type
                                    );
                                    try {
                                        e.target.bringToFront();
                                    } catch { }
                                },
                            }}
                        />
                    )}

                    {/* Debug AV: centroid + bbox + outer ring fallback */}
                    {debugAV && areaVerde && (
                        <>
                            {avCentroid && (
                                <CircleMarker pane="pane-debug" center={avCentroid} radius={6} />
                            )}
                            {avBBox && (
                                <GeoJSON pane="pane-debug" data={avBBox} style={() => ({ color: "#ff9100", weight: 2, fillOpacity: 0 })} />
                            )}
                            {avOuterRing && (
                                <Polygon pane="pane-debug" positions={avOuterRing} pathOptions={{ color: "#111", weight: 2, dashArray: "4 2" }} />
                            )}
                        </>
                    )}

                    {/* Cortes */}
                    {cortes.map((c, i) => (
                        <GeoJSON
                            pane="pane-cortes"
                            key={`cut-${i}`}
                            data={c}
                            style={() => corteStyle}
                            eventHandlers={{ add: (e) => e?.target?.bringToFront?.() }}
                        />
                    ))}

                    {/* Ruas */}
                    {visible.ruas &&
                        ruas.map((r, i) => (
                            <GeoJSON pane="pane-ruas" key={`rua-${i}`} data={r} style={() => ruaStyle} />
                        ))}

                    {/* Lotes */}
                    {visible.lotes &&
                        lotes.map((l, i) => (
                            <GeoJSON pane="pane-lotes" key={`lot-${i}`} data={l} style={() => lotStyle} />
                        ))}

                    {/* Extras do backend (overlays) */}
                    {Object.keys(extrasByOverlay).map((k) => {
                        if (!visible.overlays?.[k]) return null;
                        const feats = extrasByOverlay[k]?.features || [];
                        const color = extrasByOverlay[k]?.color || "#ff9800";
                        return feats.map((f, i) => (
                            <GeoJSON
                                pane="pane-extras"
                                key={`extra-${k}-${i}`}
                                data={f}
                                style={() => extraStyle(f, color)}
                            />
                        ));
                    })}
                </MapContainer>
            </div>
        </div>
    );
}
