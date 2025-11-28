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
import "leaflet-fullscreen";
import "leaflet-fullscreen/dist/leaflet.fullscreen.css";

import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import "@geoman-io/leaflet-geoman-free";
import * as turf from "@turf/turf";
import useAxios from "../../utils/useAxios";

import AreaVerde from "./components/AreaVerde";
import useAreaVerde from "./components/useAreaVerde";
import useRuas from "./components/useRuas";
import Ruas from "./components/Ruas";
import { Expand, Shrink } from "lucide-react";


import {
    fitToFeatures,
    featureWithOriginal,
    unionAll,
    toFeatureCollection,
    makeParallelMargins,
    clipLinesToPolygon,
    extendLinesMeters,
    ensureFeaturePolygon,
} from "./geoUtils";

import "leaflet-fullscreen";
import "leaflet-fullscreen/dist/leaflet.fullscreen.css";


const token = import.meta.env.VITE_MAPBOX_TOKEN?.trim();
const DEBUG = true;

const newUid = () => (crypto?.randomUUID?.() || `m-${Date.now()}-${Math.random().toString(36).slice(2)}`);


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
                drawPolyline: false,
                drawRectangle: false,
                drawPolygon: false,
                cutPolygon: false,
                editMode: true,   // ✅ apenas essa ferramenta visível
                dragMode: false,
                rotateMode: false,
                removalMode: false,
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
            const layer = e.layer;
            let createdOnce = false;

            // Evita o Geoman mexer no sketch após criar
            try { layer.options.pmIgnore = true; } catch { }

            const callOnce = (mode, featLike) => {
                if (createdOnce) return;
                createdOnce = true;
                try {
                    onCreateFeature(mode, featLike, map, layer);
                } catch (err) {
                    console.error("[onCreateFeature] EXCEPTION:", err);
                } finally {
                    // Desliga o draw apenas para modos não-contínuos
                    if (mode !== "areaVerde" && mode !== "corteLayer") {
                        try { map.pm.disableDraw(); } catch { }
                    }
                    // Remove o sketch da camada de desenho
                    safeRemoveDraftLayer(map, layer);
                }
            };

            try {
                const gj = layer.toGeoJSON();

                // --- MANUAL POLYGON ---
                if (drawMode === "manualPolygon") {
                    const name = (window.__manualName || "").trim();
                    if (!name) {
                        alert("Informe um nome para a restrição.");
                    } else if (!["Polygon", "MultiPolygon"].includes(gj.geometry?.type)) {
                        alert("Geometria inválida para polígono manual.");
                    } else {
                        const feat = {
                            type: "Feature",
                            geometry: gj.geometry,
                            properties: { name, role: "manual", _uid: newUid() },
                        };
                        callOnce(drawMode, feat);
                    }
                    try { window.__manualName = ""; } catch { }
                    return; // já tratou
                }

                // --- MANUAL CIRCLE (gera Polygon via Turf) ---
                if (drawMode === "manualCircle") {
                    try {
                        const name = (window.__manualName || "").trim();
                        const radiusM = Number(window.__manualRadius || 0);
                        if (!name || !(radiusM > 0)) {
                            alert("Nome/raio inválido.");
                        } else {
                            const center = layer.getLatLng();
                            const radiusKm = radiusM / 1000; // Turf usa quilômetros
                            const circlePoly = turf.circle([center.lng, center.lat], radiusKm, {
                                steps: 64,
                                units: "kilometers",
                                properties: {
                                    name,
                                    role: "manual",
                                    type: "circle",
                                    radius_m: radiusM,
                                    _uid: newUid(),
                                },
                            });
                            callOnce(drawMode, circlePoly);
                        }
                    } catch (err) {
                        console.error("Erro ao gerar polígono do círculo:", err);
                        alert("Não foi possível gerar o polígono do círculo.");
                    } finally {
                        try { window.__manualName = ""; window.__manualRadius = undefined; } catch { }
                    }
                    return; // já tratou
                }

                // --- DEMAIS MODOS (rua, areaVerde, corte etc.) ---
                callOnce(drawMode, gj);
            } catch (err) {
                console.error("[MapEffects.handleCreate] erro:", err);
                // fallback de limpeza
                try { map.pm.disableDraw(); } catch { }
                safeRemoveDraftLayer(map, e.layer);
            }
        };

        map.on("pm:create", handleCreate);
        return () => {
            map.off("pm:create", handleCreate);
        };
    }, [map, onCreateFeature, drawMode, onMapReady]);

    // Habilita/desabilita as ferramentas conforme o modo
    useEffect(() => {
        try { map.pm.disableDraw(); } catch { }

        if (drawMode === "areaVerde") {
            map.pm.enableDraw("Polygon", { snappable: true, snapDistance: 20, continueDrawing: true });
        } else if (drawMode === "corteLayer") {
            map.pm.enableDraw("Polygon", { snappable: true, snapDistance: 20, continueDrawing: true });
        } else if (drawMode === "rua") {
            map.pm.enableDraw("Line", { snappable: true, snapDistance: 20 });
        } else if (drawMode === "manualPolygon") {
            map.pm.enableDraw("Polygon", { snappable: true, snapDistance: 20 });
        } else if (drawMode === "manualCircle") {
            map.pm.enableDraw("Circle", { snappable: true, snapDistance: 20, finishOn: "dblclick" });
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
            try { getRecalc()?.(); } catch { }
        });
    };

    useEffect(() => {
        if (!map) return;
        const events = [
            "pm:markerdrag", "pm:markerdragend", "pm:edit", "pm:editend",
            "pm:vertexadded", "pm:vertexremoved", "pm:snap", "pm:unsnap",
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

// ---- helper de erro seguro (evita "Converting circular structure to JSON")
function safePickAxiosError(err) {
    const isAxios = !!err?.isAxiosError;
    const status = err?.response?.status ?? null;
    const data = err?.response?.data ?? null;
    const message = err?.message ?? null;
    const url = err?.config?.url ?? null;
    const method = err?.config?.method ?? null;
    return { isAxios, status, data, message, url, method };
}

export default function GeomanLoteador() {
    const axiosAuth = useAxios();
    const mapRef = useRef(null);

    // Restrições manuais (polígonos e círculos convertidos para Polygon)
    const [restrManuais, setRestrManuais] = useState([]);
    const manualStyle = { color: "#d97706", fillColor: "#fcd34d", fillOpacity: 0.3, weight: 2, opacity: 1 };

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
            try { recalcRef.current?.(); } catch { }
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
        ruas: ruasState,
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

    const [aoiAreaM2, setAoiAreaM2] = useState(0);
    const [loteavelAreaM2, setLoteavelAreaM2] = useState(0);

    const [restricoesList, setRestricoesList] = useState([]);
    const [labelVersao, setLabelVersao] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isListing, setIsListing] = useState(false);

    const [projetoQuery, setProjetoQuery] = useState("");
    const [isProjetosOpen, setIsProjetosOpen] = useState(false);


    // Filtro dos projetos conforme o texto digitado
    const projetosFiltrados = useMemo(() => {
        if (!projetoQuery.trim()) return projetos;
        const q = projetoQuery.toLowerCase();
        return projetos.filter((p) =>
            (p.name || "").toLowerCase().includes(q) ||
            String(p.id).includes(q)
        );
    }, [projetos, projetoQuery]);

    useEffect(() => {
        if (!projetoSel) return;
        const p = projetos.find((p) => p.id === projetoSel);
        if (p) {
            setProjetoQuery(p.name || `Projeto #${p.id}`);
        }
    }, [projetoSel, projetos]);






    useEffect(() => {
        (async () => {
            try {
                const { data: list } = await axiosAuth.get("projetos/");
                setProjetos(list);
            } catch (e) {
                console.error("[fetch projetos] erro:", safePickAxiosError(e));
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
        setLoteavelAreaM2(0);
        setLotes([]);

        setExtrasByOverlay({});
        setOverlayVisible({});
        setMarginUiByOverlay({});
        setMarginGeoByOverlay({});
        setMarginVersionByOverlay({});

        setRestrManuais([]);

        try {
            const { data: summary } = await axiosAuth.get(`projetos/${id}/map/summary/`);
            const acc = [];

            if (summary?.aoi) {
                const aoiFeat = featureWithOriginal({ type: "Feature", geometry: summary.aoi }, "geojson");
                setAoi(aoiFeat);
                setAoiAreaM2(areaM2Of(aoiFeat));
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
            console.error("[abrirProjeto] erro:", safePickAxiosError(e));
            alert("Não foi possível abrir o projeto.");
        }
    }

    // ---------- Medidas / normalização ----------
    function isPolyGeomLike(x) {
        if (!x) return false;
        if (x.type === "Feature") {
            const t = x.geometry?.type;
            return t === "Polygon" || t === "MultiPolygon";
        }
        if (x.type === "FeatureCollection") {
            return (x.features || []).some((f) => isPolyGeomLike(f));
        }
        return x.type === "Polygon" || x.type === "MultiPolygon";
    }

    function toPolygonFeature(x) {
        if (!x) return null;
        if (x.type === "Feature") return isPolyGeomLike(x) ? x : null;
        if (x.type === "FeatureCollection") {
            const polys = (x.features || []).filter(isPolyGeomLike);
            if (!polys.length) return null;
            try { return unionAll(polys); } catch { return null; }
        }
        if (x.type === "Polygon" || x.type === "MultiPolygon") {
            return { type: "Feature", geometry: x, properties: {} };
        }
        return null;
    }

    function makeValidPoly(input, label = "geom") {
        if (!input) return null;
        try {
            const f = ensureFeaturePolygon(input, label);
            try { return turf.cleanCoords(f); } catch { return f; }
        } catch { return null; }
    }

    function areaM2Of(x) {
        try { const f = toPolygonFeature(x); return f ? turf.area(f) : 0; }
        catch { return 0; }
    }

    // ---------- Linhas / overlays utilitários ----------
    const isLineFeature = (f) =>
        f?.geometry?.type === "LineString" || f?.geometry?.type === "MultiLineString";

    const overlayHasLines = (overlay) =>
        (overlay?.features || []).some((f) => isLineFeature(f));

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

    const [isFullscreen, setIsFullscreen] = useState(false);
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        // dá um tempo pro CSS aplicar, depois recalcula o tamanho
        setTimeout(() => {
            try {
                map.invalidateSize();
            } catch { }
        }, 300);
    }, [isFullscreen]);

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

    // Monta payload ad-hoc para o backend (sem salvar).
    // Converte overlays lineares em "rios / lt / ferrovias" por palavras-chave no overlayId
    // e aplica a distância configurada na UI como `margem_m`. Ruas usam `width_m`.

    const buildAdHocRestricoes = (overlayMapOverride) => {


        const aoiGeom = aoi?.geometry || null;
        // 1) AV e Corte de AV
        const av = {
            type: "FeatureCollection",
            features: (areasVerdes || []).map((f) => ({
                type: "Feature",
                geometry: f.geometry,
                properties: {},
            })),
        };
        const corte_av = {
            type: "FeatureCollection",
            features: (cortes || []).map((f) => ({
                type: "Feature",
                geometry: f.geometry,
                properties: {},
            })),
        };

        // 2) Ruas
        const defaultRuaWidthNum = Number.isFinite(+defaultRuaWidth) ? +defaultRuaWidth : 12;
        const ruas = {
            type: "FeatureCollection",
            features: (ruasState || []).map((f) => ({
                type: "Feature",
                geometry: f.geometry,
                properties: {
                    width_m:
                        Number.isFinite(+f?.properties?.width_m)
                            ? +f.properties.width_m
                            : defaultRuaWidthNum,
                },
            })),
        };

        // 3) Mapear overlays lineares → rios / lt / ferrovias
        const overlayMap = {
            rios: ["rio", "rios", "hidro", "hidrograf", "drenagem", "curso", "app_rios"],
            lt: ["lt", "linhas", "transmiss", "energia", "eletric", "linha_de_transmissao"],
            ferrovias: ["ferrovia", "ferrov", "rail", "trem", "railway", "via_ferrea"],
        };

        // 4) Restrições

        const manuaisFC = {
            type: "FeatureCollection",
            features: (restrManuais || []).map((f) => ({
                type: "Feature",
                geometry: f.geometry,
                properties: { name: f?.properties?.name || "" }, // backend lê "name"/"nome"
            })),
        };


        const matchKind = (overlayId, kind) => {
            const id = String(overlayId || "").toLowerCase();
            return (overlayMap[kind] || []).some((kw) => id.includes(kw));
        };

        const isLineFeature = (f) =>
            !!f?.geometry &&
            (f.geometry.type === "LineString" || f.geometry.type === "MultiLineString");

        // Defaults caso a UI não tenha distância configurada
        const DEF_MARGEM_RIO = 30;
        const DEF_MARGEM_LT = 15;
        const DEF_MARGEM_FER = 20;

        const riosFeats = [];
        const ltFeats = [];
        const ferFeats = [];

        Object.entries(extrasByOverlay || {}).forEach(([overlayId, pack]) => {
            // OBS: diferente da versão anterior, NÃO filtramos mais por dist>0
            const distUI = Number(marginUiByOverlay?.[overlayId]?.dist);
            const distRio = Number.isFinite(distUI) && distUI > 0 ? distUI : DEF_MARGEM_RIO;
            const distLT = Number.isFinite(distUI) && distUI > 0 ? distUI : DEF_MARGEM_LT;
            const distFer = Number.isFinite(distUI) && distUI > 0 ? distUI : DEF_MARGEM_FER;

            const targetKind = matchKind(overlayId, "rios")
                ? "rios"
                : matchKind(overlayId, "lt")
                    ? "lt"
                    : matchKind(overlayId, "ferrovias")
                        ? "ferrovias"
                        : null;

            if (!targetKind) return;

            (pack.features || [])
                .filter(isLineFeature)
                .forEach((f) => {
                    const base = {
                        type: "Feature",
                        geometry: f.geometry,
                        properties: {},
                    };
                    if (targetKind === "rios") {
                        base.properties.margem_m = distRio;
                        riosFeats.push(base);
                    } else if (targetKind === "lt") {
                        base.properties.margem_m = distLT;
                        ltFeats.push(base);
                    } else if (targetKind === "ferrovias") {
                        base.properties.margem_m = distFer;
                        ferFeats.push(base);
                    }
                });
        });

        const rios = { type: "FeatureCollection", features: riosFeats };
        const lt = { type: "FeatureCollection", features: ltFeats };
        const ferrovias = { type: "FeatureCollection", features: ferFeats };

        return {
            aoi: aoiGeom,
            av,
            corte_av,
            ruas,
            rios,
            lt,
            ferrovias,
            manuais: manuaisFC,
            default_rua_width: defaultRuaWidthNum,
            def_margem_rio: DEF_MARGEM_RIO,
            def_margem_lt: DEF_MARGEM_LT,
            def_margem_fer: DEF_MARGEM_FER,
            srid_in: 4326,
        };
    };


    async function salvarRestricoesVersao() {
        if (!projetoSel) { alert("Selecione um projeto."); return; }
        setIsSaving(true);
        try {
            const payload = {
                label: labelVersao || "",
                notes: "gerado no Geoman",
                percent_permitido: Number(percentPermitido || 0),
                source: "geoman",
                adHoc: buildAdHocRestricoes(),
            };
            console.log("[DEBUG payload]", payload);

            console.log("manuais features:", payload?.adHoc?.manuais?.features?.length);

            const { data } = await axiosAuth.post(`/projetos/${projetoSel}/restricoes/`, payload);
            alert(`Versão salva: v${data.version}`);

        } catch (e) {
            console.error("[salvar restrições] erro:", safePickAxiosError(e));
            alert("Erro ao salvar as restrições.");
        } finally {
            setIsSaving(false);
        }
    }

    // ======= RENDER =======
    return (
        <div
            className={
                isFullscreen
                    ? "fixed inset-0 z-[9999] bg-black"
                    : "w-full h-full relative mt-10"
            }
        >
            {/* Botão estilizado de fullscreen */}
            <button
                onClick={() => setIsFullscreen(f => !f)}
                className="absolute z-[1100] top-3 right-20 bg-white/80 hover:bg-white text-gray-900 p-2 rounded-lg shadow-md backdrop-blur transition"
                title={isFullscreen ? "Sair da Tela Cheia" : "Tela Cheia"}
            >
                {isFullscreen ? (
                    <Shrink size={30} strokeWidth={2} />
                ) : (
                    <Expand size={30} strokeWidth={2} />
                )}
            </button>



            {/* <div className="absolute z-[1000] bottom-70 flex items-center w-100 gap-4 text-sm bg-white/60 rounded-lg px-3 py-2">
                <div className="space-y-0.5">
                    <div className="font-medium">AOI</div>
                    <div>{(aoiAreaM2 / 1e6).toFixed(4)} km² • {(aoiAreaM2 / 10000).toFixed(2)} ha • {aoiAreaM2.toFixed(0)} m²</div>
                </div>
                <div className="w-px h-6 bg-gray-300" />
                <div className="space-y-0.5">
                    <div className="font-medium">Área Loteável</div>
                    <div>{(loteavelAreaM2 / 1e6).toFixed(4)} km² • {(loteavelAreaM2 / 10000).toFixed(2)} ha • {loteavelAreaM2.toFixed(0)} m²</div>
                </div>
            </div> */}

            {/* Painel principal (projetos / AV / Ruas / Loteável) */}
            <div className="absolute z-[1000] bottom-50 left-2 bg-white/80 rounded-xl shadow p-3 space-y-3 max-w-[1080px]">
                <div className=" flex flex-col items-start gap-2">
                    <div
                        className="relative w-full"
                        tabIndex={-1}
                        onBlur={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget)) {
                                setIsProjetosOpen(false);
                            }
                        }}
                    >
                        <input
                            className="border p-2 rounded w-full text-sm"
                            placeholder="Abrir projeto salvo…"
                            value={projetoQuery}
                            onFocus={() => setIsProjetosOpen(true)}
                            onChange={(e) => {
                                setProjetoQuery(e.target.value);
                                setIsProjetosOpen(true);
                            }}
                        />

                        {isProjetosOpen && (
                            <div className="absolute left-0 right-0 mt-1 max-h-56 overflow-auto border rounded bg-white z-[1200]">
                                {projetosFiltrados.map((p) => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        className="w-full text-left px-2 py-1 text-sm hover:bg-gray-100"
                                        onMouseDown={(e) => e.preventDefault()} // não perder o foco antes do click
                                        onClick={() => {
                                            setProjetoSel(p.id);
                                            setProjetoQuery(p.name || `Projeto #${p.id}`);
                                            setIsProjetosOpen(false);
                                            abrirProjeto(p.id);
                                        }}
                                    >
                                        {p.name || `Projeto #${p.id}`}
                                    </button>
                                ))}

                                {!projetosFiltrados.length && (
                                    <div className="px-2 py-1 text-xs text-gray-500">
                                        Nenhum projeto encontrado
                                    </div>
                                )}
                            </div>
                        )}
                    </div>


                    <button
                        onClick={() => setShowAreaVerde((v) => !v)}
                        className={`px-3 py-2 rounded ${showAreaVerde ? "bg-emerald-700 text-white" : "bg-gray-100"}`}
                        title="Abrir painel de Área Verde/Corte"
                    >
                        Área Verde
                    </button>
                    <div className="flex  flex-col items-start gap-2 flex-wrap mt-2">
                        <button
                            onClick={() => {
                                const nm = window.prompt("Nome da restrição (polígono):") || "";
                                if (!nm.trim()) { alert("Informe um nome."); return; }
                                window.__manualName = nm.trim(); // cache rápido
                                setDrawMode("manualPolygon");
                                setDrawNonce((n) => n + 1);
                            }}
                            className="px-3 py-2 rounded bg-amber-700 text-white"
                            title="Desenhar polígono manual (com nome)"
                        >
                            Polígono Manual
                        </button>

                        <button
                            onClick={() => {
                                const nm = window.prompt("Nome da restrição (círculo):") || "";
                                if (!nm.trim()) { alert("Informe um nome."); return; }
                                const raioStr = window.prompt("Raio do círculo (em metros):") || "";
                                const raio = parseFloat(raioStr);
                                if (!Number.isFinite(raio) || raio <= 0) { alert("Raio inválido."); return; }
                                window.__manualName = nm.trim();
                                window.__manualRadius = raio;
                                setDrawMode("manualCircle");
                                setDrawNonce((n) => n + 1);
                            }}
                            className="px-3 py-2 rounded bg-amber-800 text-white"
                            title="Desenhar círculo manual (o usuário clica o centro no mapa)"
                        >
                            Círculo Manual (raio m)
                        </button>
                    </div>

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

                <div className="flex flex-col items-start gap-2 mt-2">
                    <input
                        type="text"
                        className="border p-2 rounded w-72"
                        placeholder="Rótulo da versão (opcional)"
                        value={labelVersao}
                        onChange={(e) => setLabelVersao(e.target.value)}
                    />
                    <button
                        onClick={salvarRestricoesVersao}
                        disabled={!projetoSel || isSaving}
                        className={`px-3 py-2 rounded ${(!projetoSel || isSaving)
                            ? "bg-gray-300 text-gray-600"
                            : "bg-emerald-700 text-white"
                            }`}
                        title="Salvar nova versão de restrições (AV, cortes, ruas, margens)"
                    >
                        {isSaving ? "Salvando..." : "Salvar versão de restrições"}
                    </button>
                </div>

            </div>

            {/* Painel de Camadas do Backend (visíveis por padrão) + Margens (somente linhas) */}
            <div className="absolute z-[1000] top-40 left-2 bg-white/80 rounded-xl shadow p-3 space-y-2 min-w-[460px] max-w-[700px]">
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
                    // fullscreenControl={true}
                    // fullscreenControlOptions={{ position: "topright" }}
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
                        onMapReady={(m) => { mapRef.current = m; }}
                        onCreateFeature={(mode, gj) => {
                            if (mode === "areaVerde") { addAreaVerdeFromGJ(gj); return; }
                            if (mode === "corteLayer") { addCorteFromGJ(gj); return; }
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
                                        const has2 = (coords) => Array.isArray(coords) && coords.length >= 2;
                                        const parts = (g.coordinates || []).filter(has2);
                                        if (!parts.length) { alert("Linha inválida."); return; }
                                        const geom =
                                            parts.length === 1
                                                ? { type: "LineString", coordinates: parts[0] }
                                                : { type: "MultiLineString", coordinates: parts };
                                        addRuaFromGJ({ ...gj, geometry: geom }, defaultRuaWidth);
                                    }
                                }
                            }
                            if (mode === "manualPolygon" || mode === "manualCircle") {
                                const f = {
                                    type: "Feature",
                                    geometry: gj.geometry, // no circle, já vem como Polygon
                                    properties: { ...(gj.properties || {}), role: "manual" },
                                };
                                if (!f.properties._uid) f.properties._uid = newUid();
                                setRestrManuais((prev) => [...prev, f]);
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
                        ruas={ruasState}
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
                                    const has2 = (coords) => Array.isArray(coords) && coords.length >= 2;
                                    if (g.type === "LineString") return has2(g.coordinates);
                                    if (g.type === "MultiLineString") return (g.coordinates || []).some(has2);
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

                    {/* Restrições Manuais (polígonos/“círculos” convertidos) */}
                    {restrManuais.map((m, i) => (
                        <GeoJSON
                            pane="pane-restricoes"
                            key={`manual-${m?.properties?._uid ?? i}`}
                            data={m}
                            style={() => manualStyle}
                            onEachFeature={(feature, layer) => {
                                try {
                                    const uid = m?.properties?._uid ?? i;

                                    // habilita edição Geoman
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
                                            } catch { }
                                        }, 0);
                                    });

                                    // sincroniza geometria de volta ao estado ao terminar edição/drag
                                    const syncEnd = () => {
                                        const gjUpd = layer.toGeoJSON();
                                        setRestrManuais((prev) =>
                                            prev.map((it) =>
                                                (it?.properties?._uid ?? null) === uid
                                                    ? { ...it, geometry: gjUpd.geometry }
                                                    : it
                                            )
                                        );
                                    };
                                    layer.on("pm:markerdragend", syncEnd);
                                    layer.on("pm:editend", syncEnd);
                                    layer.on("pm:dragend", syncEnd);

                                    // remover
                                    layer.on("pm:remove", () => {
                                        setRestrManuais((prev) => prev.filter((it) => (it?.properties?._uid ?? null) !== uid));
                                    });

                                    // clique para renomear (opcional)
                                    layer.on("click", (ev) => {
                                        if (!ev.originalEvent?.shiftKey) return; // por exemplo: use Shift+Click para evitar conflito com edição
                                        const curr = (m?.properties?.name || "");
                                        const nm = window.prompt("Renomear restrição:", curr);
                                        if (nm == null) return;
                                        setRestrManuais((prev) =>
                                            prev.map((it) =>
                                                (it?.properties?._uid ?? null) === uid
                                                    ? { ...it, properties: { ...it.properties, name: nm.trim() } }
                                                    : it
                                            )
                                        );
                                    });
                                } catch { }
                            }}
                        />
                    ))}

                </MapContainer>
            </div>
        </div >
    );
}
