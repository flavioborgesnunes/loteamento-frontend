// src/pages/geoman/GeomanLoteador.jsx
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
import "@geoman-io/leaflet-geoman-free";
import * as turf from "@turf/turf";
import useAxios from "../../utils/useAxios";

import AreaVerde from "./components/AreaVerde";
import useAreaVerde from "./components/useAreaVerde";
import useRuas from "./components/useRuas";
import Ruas from "./components/Ruas";

import {
    fitToFeatures,
    featureWithOriginal,
    unionAll,
    differenceMany,
    toFeatureCollection,
    makeParallelMargins,
    clipLinesToPolygon,
    extendLinesMeters,
} from "./geoUtils";

const token = import.meta.env.VITE_MAPBOX_TOKEN?.trim();
const DEBUG = true;
function DBG(tag, obj = undefined) {
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

/** Remove o layer desenhado pelo Geoman de forma segura (evita _removePath / lat undefined). */
function safeRemoveDraftLayer(map, layer) {
    if (!layer) return;
    try { layer.off(); } catch { }
    try {
        if (map && map.hasLayer(layer)) {
            setTimeout(() => {
                try {
                    if (map.hasLayer(layer)) map.removeLayer(layer);
                } catch { }
            }, 0);
        }
    } catch { }
}

function MapEffects({ drawMode, drawNonce, onCreateFeature, onMapReady }) {
    const map = useMap();
    const controlsReadyRef = useRef(false);

    useEffect(() => {
        if (!controlsReadyRef.current) {
            map.pm.addControls({
                position: "topleft",
                drawMarker: false,
                drawCircle: false,
                drawCircleMarker: false,
                drawText: false,
                drawPolyline: true,
                drawRectangle: false,
                drawPolygon: true,
                cutPolygon: true,
                editMode: true,
                dragMode: true,
                rotateMode: false,
                removalMode: true,
            });
            try {
                map.pm.setGlobalOptions({
                    allowSelfIntersection: false,
                    snappable: true,
                    snapDistance: 20,
                });
            } catch { }
            controlsReadyRef.current = true;
            onMapReady?.(map);
        }

        const handleCreate = (e) => {
            try { e.layer.options.pmIgnore = true; } catch { }
            const gj = e.layer.toGeoJSON();
            try {
                onCreateFeature(drawMode, gj, map, e.layer);
            } catch (err) {
                console.error("[onCreateFeature] EXCEPTION:", err);
            } finally {
                if (drawMode !== "areaVerde" && drawMode !== "corteLayer") {
                    try {
                        map.pm.disableDraw();
                    } catch { }
                }
                // Remoção segura do sketch
                safeRemoveDraftLayer(map, e.layer);
            }
        };

        map.on("pm:create", handleCreate);
        return () => {
            map.off("pm:create", handleCreate);
        };
    }, [map, onCreateFeature, drawMode, onMapReady]);

    useEffect(() => {
        try {
            map.pm.disableDraw();
        } catch { }
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

function PmRealtimeRecalc({ getRecalc }) {
    const map = useMap();
    const raf = useRef(null);
    const schedule = () => {
        if (raf.current) return;
        raf.current = requestAnimationFrame(() => {
            raf.current = null;
            try {
                getRecalc()?.();
            } catch { }
        });
    };

    useEffect(() => {
        if (!map) return;
        const events = [
            "pm:markerdrag",
            "pm:markerdragend",
            "pm:edit",
            "pm:editend",
            "pm:vertexadded",
            "pm:vertexremoved",
            "pm:snap",
            "pm:unsnap",
            "pm:create",
            "pm:remove",
            "pm:drag",
            "pm:dragend",
        ];
        events.forEach((ev) => map.on(ev, schedule));
        return () => {
            events.forEach((ev) => map.off(ev, schedule));
            if (raf.current) cancelAnimationFrame(raf.current);
        };
    }, [map]);

    return null;
}

export default function GeomanLoteador() {
    const axiosAuth = useAxios();
    const mapRef = useRef(null);

    const avLayerByUid = useRef(new Map());
    const corteLayerByUid = useRef(new Map());

    const {
        areasVerdes,
        setAreasVerdes,
        cortes,
        setCortes,
        areaLoteavel,
        setAreaLoteavel,
        avAreaM2,
        cortesAreaM2,
        cortePct,
        percentPermitido,
        setPercentPermitido,
        addAreaVerdeFromGJ,
        addCorteFromGJ,
        limparCortes,
        recalcRef,
        seqRef,
        syncLayerToState,
    } = useAreaVerde({
        avLayerByUidRef: avLayerByUid,
        corteLayerByUidRef: corteLayerByUid,
        fitToMap: (f) => {
            if (mapRef.current) fitToFeatures(mapRef.current, f);
        },
    });

    // rAF local p/ recálculo leve
    const recalcRAF = useRef(null);
    const scheduleRecalc = useCallback(() => {
        if (recalcRAF.current) return;
        recalcRAF.current = requestAnimationFrame(() => {
            recalcRAF.current = null;
            try {
                recalcRef.current?.();
            } catch { }
        });
    }, [recalcRef]);
    useEffect(() => () => {
        if (recalcRAF.current) cancelAnimationFrame(recalcRAF.current);
    }, []);

    const [projetos, setProjetos] = useState([]);
    const [projetoSel, setProjetoSel] = useState("");
    const [aoi, setAoi] = useState(null);
    const [lotes, setLotes] = useState([]);

    // Overlays do backend agrupados por overlay_id
    const [extrasByOverlay, setExtrasByOverlay] = useState({});
    // Visibilidade por overlay (camada base) — padrão TRUE
    const [overlayVisible, setOverlayVisible] = useState({}); // { [overlayId]: bool }

    // RUAS via hook separado
    const {
        ruas,
        defaultRuaWidth,
        setDefaultRuaWidth,
        ruaMask,
        addRuaFromGJ,
        updateRuaGeometry,
        updateRuaWidth,
        removeRua,
    } = useRuas({ aoiForClip: aoi });

    const [drawMode, setDrawMode] = useState("none");
    const [drawNonce, setDrawNonce] = useState(0);
    const [showAreaVerde, setShowAreaVerde] = useState(false);

    // ======= Margens (somente linhas) =======
    // UI por overlay linear: { dist: number, show: boolean }
    const [marginUiByOverlay, setMarginUiByOverlay] = useState({});
    // Geo de margens geradas por overlay
    const [marginGeoByOverlay, setMarginGeoByOverlay] = useState({});
    // Versão para forçar remount do GeoJSON da margem
    const [marginVersionByOverlay, setMarginVersionByOverlay] = useState({});

    // --- Helpers de validação de linhas (evita latLng undefined) ---
    const has2pts = (coords) => Array.isArray(coords) && coords.length >= 2;
    const isValidLineGeom = (g) =>
        g &&
        ((g.type === "LineString" && has2pts(g.coordinates)) ||
            (g.type === "MultiLineString" && (g.coordinates || []).some(has2pts)));
    const filterValidLineFeats = (fcOrFeat) =>
        toFeatureCollection(fcOrFeat).features.filter((f) => isValidLineGeom(f.geometry || {}));

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

        const avFeats = feats.filter(
            (f) =>
                f.properties?.role === "area_verde" &&
                ["Polygon", "MultiPolygon"].includes(f.geometry?.type)
        );
        if (avFeats.length) {
            setAreasVerdes((prev) => {
                if (prev.length) return prev;
                const list = avFeats.map((f) => {
                    const avNorm =
                        f.type === "Feature"
                            ? f
                            : { type: "Feature", geometry: f.geometry, properties: f.properties || {} };
                    const withSeq = featureWithOriginal(avNorm, "geojson");
                    withSeq.properties._uid = ++seqRef.current.av;
                    return withSeq;
                });
                return list;
            });
            setTimeout(() => recalcRef.current?.(), 0);
        }

        const ruasFeats = feats.filter(
            (f) =>
                f.properties?.role === "rua" &&
                ["LineString", "MultiLineString"].includes(f.geometry?.type)
        );
        if (ruasFeats.length) {
            const list = ruasFeats.map((f) => featureWithOriginal(f, "geojson"));
            list.forEach((gj) => addRuaFromGJ(gj, gj?.properties?.width_m));
        }

        const lotPolys = feats.filter(
            (f) =>
                f.properties?.role === "lote" &&
                ["Polygon", "MultiPolygon"].includes(f.geometry?.type)
        );
        if (lotPolys.length) {
            const list = lotPolys.map((f) => featureWithOriginal(f, "geojson"));
            setLotes((prev) => [...prev, ...list]);
        }
    }

    async function abrirProjeto(id) {
        if (!Number.isFinite(id)) return;
        setProjetoSel(id);

        setAoi(null);
        setAreasVerdes([]);
        avLayerByUid.current = new Map();
        setCortes([]);
        corteLayerByUid.current = new Map();
        setAreaLoteavel(null);
        setLotes([]);

        setExtrasByOverlay({});
        setOverlayVisible({});
        setMarginUiByOverlay({});
        setMarginGeoByOverlay({});
        setMarginVersionByOverlay({});

        try {
            const { data: summary } = await axiosAuth.get(`projetos/${id}/map/summary/`);
            const acc = [];

            if (summary?.aoi) {
                const aoiFeat = featureWithOriginal({ type: "Feature", geometry: summary.aoi }, "geojson");
                setAoi(aoiFeat);
                acc.push(aoiFeat);
            }

            const overlaysList = (summary?.overlays || []).filter((o) => (o?.count || 0) > 0);

            // Por padrão, deixa TODOS os overlays visíveis
            setOverlayVisible((prev) => {
                const next = { ...prev };
                overlaysList.forEach((o) => (next[o.overlay_id] = true));
                return next;
            });

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

            if (mapRef.current && acc.length)
                fitToFeatures(mapRef.current, { type: "FeatureCollection", features: acc });
            setTimeout(() => recalcRef.current?.(), 0);
        } catch (e) {
            console.error("[abrirProjeto] erro:", e);
            alert("Não foi possível abrir o projeto.");
        }
    }

    function gerarAreaLoteavelComRestricoes() {
        const avUnion = unionAll(areasVerdes);
        const cortesUnion = unionAll(cortes);
        let base = avUnion;
        if (base && cortesUnion) base = differenceMany(base, [cortesUnion]);
        const masks = ruaMask ? [ruaMask] : [];
        const final = base ? differenceMany(base, masks) : null;

        setAreaLoteavel(
            final ? { ...final, properties: { ...(final.properties || {}), _uid: "loteavel-ruas" } } : null
        );
    }

    // ===== Helpers Margens / tipos =====
    const isLineFeature = (f) =>
        f?.geometry?.type === "LineString" || f?.geometry?.type === "MultiLineString";
    const overlayHasLines = (overlay) => (overlay?.features || []).some((f) => isLineFeature(f));

    // Todos overlays ordenados
    const overlayList = useMemo(
        () => Object.keys(extrasByOverlay).sort((a, b) => a.localeCompare(b)),
        [extrasByOverlay]
    );

    // Inicializa dist padrão (30m) ao detectar overlay linear
    useEffect(() => {
        if (!overlayList.length) return;
        setMarginUiByOverlay((prev) => {
            const next = { ...prev };
            overlayList.forEach((oid) => {
                const ov = extrasByOverlay[oid];
                if (overlayHasLines(ov) && !next[oid]) next[oid] = { dist: 30, show: true };
            });
            return next;
        });
    }, [overlayList, extrasByOverlay]);

    // ==== Geração de margens ====
    const generateMarginsForOverlay = useCallback(
        (overlayId, { fit = false } = {}) => {
            const map = mapRef.current;
            const base = extrasByOverlay[overlayId];
            if (!map || !base?.features?.length || !overlayHasLines(base)) return;

            const dist = Number(marginUiByOverlay[overlayId]?.dist || 0);
            if (!(dist > 0)) {
                // remove margem existente
                setMarginGeoByOverlay((prev) => {
                    if (!prev[overlayId]) return prev;
                    const { [overlayId]: _, ...rest } = prev;
                    return rest;
                });
                setMarginVersionByOverlay((prev) => ({ ...prev, [overlayId]: (prev[overlayId] || 0) + 1 }));
                return;
            }

            const fcLines = toFeatureCollection({
                type: "FeatureCollection",
                features: base.features.filter((f) => isLineFeature(f)),
            });

            let margins = makeParallelMargins(fcLines, dist, {
                sourceId: overlayId,
                props: { layer_name: overlayId },
            });

            // Estende antes de clipar para “encostar” na AOI
            const EXTEND_BEFORE_CLIP_M = Math.min(120, Math.max(20, dist * 1.2));
            margins = extendLinesMeters(margins, EXTEND_BEFORE_CLIP_M);

            // Não passar da AOI (e encostar na borda)
            if (aoi) {
                margins = clipLinesToPolygon(margins, aoi, { keepBoundary: true });
            }

            // Sanitize: manter apenas segmentos válidos 2+ pontos
            if (margins?.features?.length) {
                const feats = filterValidLineFeats(margins);
                margins = { type: "FeatureCollection", features: feats };
                if (!margins.features.length) {
                    setMarginGeoByOverlay((prev) => {
                        if (!prev[overlayId]) return prev;
                        const { [overlayId]: _, ...rest } = prev;
                        return rest;
                    });
                    setMarginVersionByOverlay((prev) => ({ ...prev, [overlayId]: (prev[overlayId] || 0) + 1 }));
                    return;
                }
            } else {
                return;
            }

            setMarginGeoByOverlay((prev) => ({ ...prev, [overlayId]: margins }));
            setMarginVersionByOverlay((prev) => ({ ...prev, [overlayId]: (prev[overlayId] || 0) + 1 }));

            if (fit) {
                try {
                    const tmp = L.geoJSON(margins);
                    const b = tmp.getBounds();
                    if (b && b.isValid()) map.fitBounds(b, { padding: [20, 20] });
                } catch { }
            }
        },
        [extrasByOverlay, marginUiByOverlay, aoi]
    );

    const handleGenerateMarginsOne = useCallback(
        (overlayId) => generateMarginsForOverlay(overlayId, { fit: true }),
        [generateMarginsForOverlay]
    );

    const handleGenerateMarginsAll = useCallback(() => {
        const map = mapRef.current;
        if (!map) return;
        const next = {};
        const nextVer = {};
        const bounds = [];

        overlayList.forEach((overlayId) => {
            if (!overlayVisible[overlayId]) return; // só para visíveis (mude se quiser)
            const base = extrasByOverlay[overlayId];
            if (!base?.features?.length || !overlayHasLines(base)) return;

            const dist = Number(marginUiByOverlay[overlayId]?.dist || 0);
            if (!(dist > 0)) return;

            const fcLines = toFeatureCollection({
                type: "FeatureCollection",
                features: base.features.filter((f) => isLineFeature(f)),
            });

            let margins = makeParallelMargins(fcLines, dist, {
                sourceId: overlayId,
                props: { layer_name: overlayId },
            });
            margins = extendLinesMeters(margins, Math.min(120, Math.max(20, dist * 1.2)));
            if (aoi) margins = clipLinesToPolygon(margins, aoi, { keepBoundary: true });

            // sanitize
            const feats = filterValidLineFeats(margins);
            if (!feats.length) return;
            next[overlayId] = { type: "FeatureCollection", features: feats };
            nextVer[overlayId] = (marginVersionByOverlay[overlayId] || 0) + 1;

            try {
                const tmp = L.geoJSON(next[overlayId]);
                const b = tmp.getBounds();
                if (b && b.isValid()) bounds.push(b);
            } catch { }
        });

        if (Object.keys(next).length) {
            setMarginGeoByOverlay((prev) => ({ ...prev, ...next }));
            setMarginVersionByOverlay((prev) => ({ ...prev, ...nextVer }));
        }

        // Fit geral
        try {
            if (bounds.length) {
                let total = bounds[0];
                for (let i = 1; i < bounds.length; i++) total = total.extend(bounds[i]);
                map.fitBounds(total, { padding: [30, 30] });
            }
        } catch { }
    }, [
        overlayList,
        overlayVisible,
        extrasByOverlay,
        marginUiByOverlay,
        aoi,
        marginVersionByOverlay,
    ]);

    // ===== Estilos =====
    const excedeu = cortePct > (parseFloat(percentPermitido) || 0) + 1e-6;
    const avStyle = {
        color: excedeu ? "#ff4d4f" : "#007a4d",
        fillColor: excedeu ? "#ff4d4f" : "#41d686",
        fillOpacity: 0.45,
        weight: 3,
        opacity: 1,
    };
    const corteStyle = {
        color: "#e11d48",
        fillColor: "#fca5a5",
        fillOpacity: 0.35,
        weight: 2,
        dashArray: "6 3",
        opacity: 1,
    };
    const loteavelStyle = {
        color: "#1f6feb",
        fillColor: "#9ecbff",
        fillOpacity: 0.35,
        weight: 3,
        opacity: 1,
    };
    const lotStyle = { color: "#8e44ad", fillOpacity: 0.2, weight: 1, opacity: 1 };
    const marginStyle = { color: "#ff8800", weight: 2, dashArray: "4 4", opacity: 1 };

    // estilo base para overlays do backend
    const styleForOverlayFeature = (overlayId) => (feat) => {
        const baseColor = extrasByOverlay[overlayId]?.color || "#2f6db3";
        const g = feat.geometry?.type;
        if (g === "LineString" || g === "MultiLineString") {
            return { color: baseColor, weight: 2, opacity: 1 };
        }
        if (g === "Polygon" || g === "MultiPolygon") {
            return { color: baseColor, weight: 1.5, fillColor: baseColor, fillOpacity: 0.08, opacity: 1 };
        }
        return { color: baseColor, weight: 2, opacity: 1 };
    };

    return (
        <div className="w-full h-full relative">
            {/* Painel principal (projetos / AV / Ruas / Loteável) */}
            <div className="absolute z-[1000] bottom-10 left-2 bg-white/40 rounded-xl shadow p-3 space-y-3 max-w-[1080px]">
                <div className="flex items-center gap-2">
                    <select
                        className="border p-2 rounded w-full"
                        value={projetoSel || ""}
                        onChange={(e) => {
                            const idNum = Number(e.target.value);
                            if (Number.isFinite(idNum)) abrirProjeto(idNum);
                        }}
                    >
                        <option value="">Abrir projeto salvo…</option>
                        {projetos.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name || `Projeto #${p.id}`}
                            </option>
                        ))}
                    </select>

                    <button
                        onClick={() => setShowAreaVerde((v) => !v)}
                        className={`px-3 py-2 rounded ${showAreaVerde ? "bg-emerald-700 text-white" : "bg-gray-100"}`}
                        title="Abrir painel de Área Verde/Corte"
                    >
                        Área Verde
                    </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <label className="text-sm">Largura da rua (m)</label>
                    <input
                        type="number"
                        className="border p-1 rounded w-24"
                        value={defaultRuaWidth}
                        onChange={(e) => setDefaultRuaWidth(parseFloat(e.target.value || "0"))}
                        min={0}
                    />
                    <button
                        onClick={() => {
                            setDrawMode("rua");
                            setDrawNonce((n) => n + 1);
                        }}
                        className="px-3 py-2 rounded bg-gray-800 text-white"
                        title="Desenhar nova rua"
                    >
                        Desenhar Rua
                    </button>
                </div>

                <button
                    onClick={gerarAreaLoteavelComRestricoes}
                    className="px-3 py-2 rounded bg-blue-700 text-white"
                    title="AVs − cortes − restrições (máscara de ruas)"
                >
                    Gerar Área Loteável
                </button>
            </div>

            {/* Painel de Camadas do Backend (visíveis por padrão) + Margens (somente linhas) */}
            <div className="absolute z-[1000] top-2 left-2 bg-white/90 rounded-xl shadow p-3 space-y-2 min-w-[460px] max-w-[700px]">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Camadas do backend</h3>
                    <button
                        className="px-3 py-1 rounded bg-amber-600 text-white"
                        onClick={handleGenerateMarginsAll}
                        title="Gerar margens para todas as camadas lineares visíveis"
                    >
                        Gerar margens (todas)
                    </button>
                </div>

                {!overlayList.length && (
                    <div className="text-sm text-gray-600">Nenhuma camada carregada do backend neste projeto.</div>
                )}

                {overlayList.map((overlayId) => {
                    const visible = !!overlayVisible[overlayId];
                    const isLinear = overlayHasLines(extrasByOverlay[overlayId]);
                    const dist = marginUiByOverlay[overlayId]?.dist ?? 30;
                    const showMargin = marginUiByOverlay[overlayId]?.show ?? true;

                    return (
                        <div key={overlayId} className="flex items-center gap-2">
                            <label className="flex items-center gap-2 min-w-[220px]">
                                <input
                                    type="checkbox"
                                    checked={visible}
                                    onChange={() =>
                                        setOverlayVisible((prev) => ({ ...prev, [overlayId]: !prev[overlayId] }))
                                    }
                                />
                                <span className="truncate" title={overlayId}>
                                    {overlayId}
                                </span>
                            </label>

                            {/* Apenas para camadas LINEARES: distância + gerar margem + toggle margem */}
                            {isLinear ? (
                                <>
                                    <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        className="border p-1 rounded w-24"
                                        value={dist}
                                        onChange={(e) => {
                                            const v = Number(e.target.value) || 0;
                                            setMarginUiByOverlay((prev) => ({
                                                ...prev,
                                                [overlayId]: { ...(prev[overlayId] || { show: true }), dist: v },
                                            }));
                                        }}
                                        placeholder="dist (m)"
                                        title="Distância da margem (metros)"
                                    />
                                    <button
                                        className="px-2 py-1 rounded bg-amber-700 text-white"
                                        onClick={() => handleGenerateMarginsOne(overlayId)}
                                        title="Gerar margens paralelas (ambos os lados) para esta camada"
                                    >
                                        Gerar margem
                                    </button>
                                    <label className="flex items-center gap-1 text-xs">
                                        <input
                                            type="checkbox"
                                            checked={showMargin}
                                            onChange={() =>
                                                setMarginUiByOverlay((prev) => ({
                                                    ...prev,
                                                    [overlayId]: {
                                                        ...(prev[overlayId] || { dist: 30 }),
                                                        show: !(prev[overlayId]?.show ?? true),
                                                    },
                                                }))
                                            }
                                        />
                                        margem
                                    </label>
                                </>
                            ) : (
                                <span className="text-xs text-gray-500">(poligonal)</span>
                            )}
                        </div>
                    );
                })}
            </div>

            <AreaVerde
                open={showAreaVerde}
                onClose={() => setShowAreaVerde(false)}
                onDrawAreaVerde={() => {
                    setDrawMode("areaVerde");
                    setDrawNonce((n) => n + 1);
                }}
                onDrawCorte={() => {
                    setDrawMode("corteLayer");
                    setDrawNonce((n) => n + 1);
                }}
                onLimparCortes={limparCortes}
                percentPermitido={percentPermitido}
                setPercentPermitido={setPercentPermitido}
                avAreaM2={avAreaM2}
                cortesAreaM2={cortesAreaM2}
                cortePct={cortePct}
                areasCount={areasVerdes.length}
                cortesCount={cortes.length}
                excedeu={excedeu}
            />

            <div style={{ height: "100vh", width: "100%" }}>
                <MapContainer
                    center={[-14, -55]}
                    zoom={4}
                    style={{ height: "100%", width: "100%" }}
                    whenCreated={(m) => {
                        mapRef.current = m;
                        setTimeout(() => recalcRef.current?.(), 0);
                    }}
                >
                    <TilesWithFallback />

                    <Pane name="pane-aoi" style={{ zIndex: 520 }} />
                    <Pane name="pane-avs" style={{ zIndex: 580 }} />
                    <Pane name="pane-loteavel" style={{ zIndex: 585 }} />
                    <Pane name="pane-cortes" style={{ zIndex: 590 }} />
                    <Pane name="pane-ruas" style={{ zIndex: 540 }} />
                    <Pane name="pane-lotes" style={{ zIndex: 535 }} />
                    <Pane name="pane-overlays" style={{ zIndex: 550 }} />
                    <Pane name="pane-margens" style={{ zIndex: 595 }} />
                    <Pane name="pane-restricoes" style={{ zIndex: 999 }} />

                    <PmRealtimeRecalc getRecalc={() => recalcRef.current} />

                    <MapEffects
                        drawMode={drawMode}
                        drawNonce={drawNonce}
                        onMapReady={(m) => {
                            mapRef.current = m;
                        }}
                        onCreateFeature={(mode, gj) => {
                            if (mode === "areaVerde") {
                                addAreaVerdeFromGJ(gj);
                                return;
                            }
                            if (mode === "corteLayer") {
                                addCorteFromGJ(gj);
                                return;
                            }
                            if (mode === "rua") {
                                if (gj.geometry.type === "LineString" || gj.geometry.type === "MultiLineString") {
                                    const g = gj.geometry;
                                    if (g.type === "LineString") {
                                        const coordsRaw = g.coordinates || [];
                                        const coordsNum = coordsRaw.filter(
                                            (c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])
                                        );
                                        // remove duplicados consecutivos
                                        const coords = coordsNum.filter(
                                            (pt, i, arr) => i === 0 || pt[0] !== arr[i - 1][0] || pt[1] !== arr[i - 1][1]
                                        );
                                        if (coords.length >= 2) {
                                            addRuaFromGJ(
                                                { ...gj, geometry: { type: "LineString", coordinates: coords } },
                                                defaultRuaWidth
                                            );
                                        } else {
                                            alert("Linha muito curta. Desenhe com pelo menos dois pontos.");
                                        }
                                    } else {
                                        // MultiLineString → mantém só partes com 2+ pontos
                                        const parts = (g.coordinates || []).filter(has2pts);
                                        if (!parts.length) {
                                            alert("Linha inválida.");
                                            return;
                                        }
                                        const geom =
                                            parts.length === 1
                                                ? { type: "LineString", coordinates: parts[0] }
                                                : { type: "MultiLineString", coordinates: parts };
                                        addRuaFromGJ({ ...gj, geometry: geom }, defaultRuaWidth);
                                    }
                                }
                                return;
                            }
                        }}
                    />

                    {aoi && (
                        <GeoJSON
                            pane="pane-aoi"
                            key="aoi"
                            data={aoi}
                            style={() => ({ color: "#3498db", fillOpacity: 0.08, weight: 2, opacity: 1 })}
                            eventHandlers={{ add: (e) => { try { e.target.options.pmIgnore = true; } catch { } } }}
                        />
                    )}

                    {/* Área Verde */}
                    {areasVerdes.map((av, i) => (
                        <GeoJSON
                            pane="pane-avs"
                            key={`av-${av?.properties?._uid ?? i}`}
                            data={av}
                            style={() => avStyle}
                            onEachFeature={(feature, layer) => {
                                try {
                                    const uid = av?.properties?._uid ?? i;
                                    layer._avUid = uid;
                                    layer.once("add", () => {
                                        setTimeout(() => {
                                            try {
                                                layer.pm?.enable?.({
                                                    allowSelfIntersection: false,
                                                    snappable: true,
                                                    snapDistance: 20,
                                                });
                                                layer.options.pmIgnore = false;
                                                layer.bringToFront?.();
                                                scheduleRecalc();
                                            } catch { }
                                        }, 0);
                                    });
                                    const recalcLive = () => scheduleRecalc();
                                    layer.on("pm:markerdrag", recalcLive);
                                    layer.on("pm:snap", recalcLive);
                                    layer.on("pm:unsnap", recalcLive);
                                    layer.on("pm:edit", recalcLive);
                                    layer.on("pm:vertexadded", recalcLive);
                                    layer.on("pm:vertexremoved", recalcLive);
                                    layer.on("pm:drag", recalcLive);
                                    const syncEnd = () => {
                                        syncLayerToState("av", uid, layer);
                                        scheduleRecalc();
                                    };
                                    layer.on("pm:markerdragend", syncEnd);
                                    layer.on("pm:editend", syncEnd);
                                    layer.on("pm:dragend", syncEnd);
                                    const onPmRemove = () => {
                                        setAreasVerdes((prev) => prev.filter((it) => (it?.properties?._uid ?? null) !== uid));
                                        scheduleRecalc();
                                    };
                                    layer.on("pm:remove", onPmRemove);
                                } catch { }
                            }}
                        />
                    ))}

                    {/* Loteável */}
                    {areaLoteavel && (
                        <GeoJSON
                            pane="pane-loteavel"
                            key={`loteavel-${areaLoteavel?.properties?._uid ?? "0"}`}
                            data={areaLoteavel}
                            style={() => loteavelStyle}
                        />
                    )}

                    {/* Cortes */}
                    {cortes.map((c, i) => (
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
                                                layer.pm?.enable?.({
                                                    allowSelfIntersection: false,
                                                    snappable: true,
                                                    snapDistance: 20,
                                                });
                                                layer.options.pmIgnore = false;
                                                layer.bringToFront?.();
                                                scheduleRecalc();
                                            } catch { }
                                        }, 0);
                                    });
                                    const recalcLive = () => scheduleRecalc();
                                    layer.on("pm:markerdrag", recalcLive);
                                    layer.on("pm:snap", recalcLive);
                                    layer.on("pm:unsnap", recalcLive);
                                    layer.on("pm:edit", recalcLive);
                                    layer.on("pm:vertexadded", recalcLive);
                                    layer.on("pm:vertexremoved", recalcLive);
                                    layer.on("pm:drag", recalcLive);
                                    const syncEnd = () => {
                                        syncLayerToState("corte", uid, layer);
                                        scheduleRecalc();
                                    };
                                    layer.on("pm:markerdragend", syncEnd);
                                    layer.on("pm:editend", syncEnd);
                                    layer.on("pm:dragend", syncEnd);
                                    const onPmRemove = () => {
                                        setCortes((prev) => prev.filter((it) => (it?.properties?._uid ?? null) !== uid));
                                        scheduleRecalc();
                                    };
                                    layer.on("pm:remove", onPmRemove);
                                } catch { }
                            }}
                        />
                    ))}

                    {/* RUAS */}
                    <Ruas
                        ruas={ruas}
                        ruaMask={ruaMask}
                        defaultRuaWidth={defaultRuaWidth}
                        paneRuas="pane-ruas"
                        paneMask="pane-restricoes"
                        onRuaEdited={(uid, gj) => updateRuaGeometry(uid, gj)}
                        onRuaRemoved={(uid) => removeRua(uid)}
                        onRuaWidthPrompt={(uid, current) => {
                            const val = window.prompt("Largura desta rua (m):", String(current));
                            if (val == null) return;
                            const width = Number(val);
                            if (!Number.isFinite(width) || width <= 0) return;
                            updateRuaWidth(uid, width);
                        }}
                    />

                    {/* Lotes */}
                    {lotes.map((l, i) => (
                        <GeoJSON pane="pane-lotes" key={`lot-${i}`} data={l} style={() => lotStyle} />
                    ))}

                    {/* OVERLAYS BASE do backend (visíveis por padrão) */}
                    {overlayList.map((overlayId) => {
                        if (!overlayVisible[overlayId]) return null;
                        const fc = toFeatureCollection({
                            type: "FeatureCollection",
                            features: extrasByOverlay[overlayId]?.features || [],
                        });
                        if (!fc.features.length) return null;
                        return (
                            <GeoJSON
                                pane="pane-overlays"
                                key={`overlay-${overlayId}`}
                                data={fc}
                                style={styleForOverlayFeature(overlayId)}
                                filter={(feat) => {
                                    const g = feat?.geometry;
                                    if (!g) return false;
                                    if (g.type === "LineString") return has2pts(g.coordinates);
                                    if (g.type === "MultiLineString") return (g.coordinates || []).some(has2pts);
                                    return true; // polígonos/pontos passam
                                }}
                            />
                        );
                    })}

                    {/* MARGENS GERADAS */}
                    {Object.entries(marginGeoByOverlay).map(([overlayId, fc]) =>
                        (marginUiByOverlay[overlayId]?.show ?? true) ? (
                            <GeoJSON
                                pane="pane-margens"
                                key={`margem-${overlayId}-${(marginVersionByOverlay[overlayId] || 0)}`}
                                data={fc}
                                style={() => marginStyle}
                                filter={(feat) => isValidLineGeom(feat?.geometry)}
                            />
                        ) : null
                    )}
                </MapContainer>
            </div>
        </div>
    );
}
