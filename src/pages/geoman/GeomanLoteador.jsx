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

import Swal from "sweetalert2";
import JSZip from "jszip";
import tokml from "tokml";


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

const showAlert = (
    text,
    {
        title = "Atenção",
        icon = "warning", // 'success' | 'error' | 'info' | 'warning' | 'question'
    } = {}
) => {
    Swal.fire({
        title,
        text,
        icon,
        confirmButtonColor: "#16a34a", // verdezinho Tailwind-like
        confirmButtonText: "OK",
    });
};


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
                        showAlert("Informe um nome para a restrição.", {
                            icon: "warning",
                            title: "Nome obrigatório",
                        });
                    } else if (!["Polygon", "MultiPolygon"].includes(gj.geometry?.type)) {
                        showAlert("Geometria inválida para polígono manual.", {
                            icon: "error",
                            title: "Geometria inválida",
                        });
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
                            showAlert("Nome/raio inválido.", {
                                icon: "warning",
                                title: "Dados inválidos",
                            });
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
                        showAlert("Não foi possível gerar o polígono do círculo.", {
                            icon: "error",
                            title: "Erro ao gerar círculo",
                        });
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

function limparRuas() {
    try {
        (ruasState || []).forEach((r) => {
            const uid = r?.properties?._uid;
            if (uid != null) {
                removeRua(uid);
            }
        });
    } catch (e) {
        console.error("[Geoman] erro ao limpar ruas:", e);
    }
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

    // Versões de restrições do projeto atual
    const [restricoesVersoes, setRestricoesVersoes] = useState([]);
    const [restricaoSelId, setRestricaoSelId] = useState(null);


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

    const [outFormat, setOutFormat] = useState("kmz");

    // --- RESTRIÇÕES SALVAS (para editar) ---
    const [restricoesTodas, setRestricoesTodas] = useState([]);
    const [restricoesQuery, setRestricoesQuery] = useState("");
    const [isRestricoesOpen, setIsRestricoesOpen] = useState(false);

    const restricoesFiltradas = useMemo(() => {
        if (!restricoesQuery.trim()) return restricoesTodas;
        const q = restricoesQuery.toLowerCase();
        return restricoesTodas.filter((r) =>
            (r.label || "").toLowerCase().includes(q) ||
            (r.project_name || "").toLowerCase().includes(q)
        );
    }, [restricoesTodas, restricoesQuery]);


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
                showAlert("Erro ao carregar projetos (faça login).", {
                    icon: "error",
                    title: "Erro ao carregar projetos",
                });
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
            showAlert("Não foi possível abrir o projeto.", {
                icon: "error",
                title: "Erro ao abrir projeto",
            });
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

    // Estilos para aparecer bonitinho no Google Earth (tokml simplestyle)
    const ROLE_STYLES = {
        aoi: {
            stroke: "#3498db",
            "stroke-width": 2,
            "stroke-opacity": 1,
            fill: "#3498db",
            "fill-opacity": 0.05,
        },
        area_loteavel: {
            stroke: "#1f6feb",
            "stroke-width": 2,
            "stroke-opacity": 1,
            fill: "#9ecbff",
            "fill-opacity": 0.35,
        },
        area_verde: {
            stroke: "#007a4d",
            "stroke-width": 2,
            "stroke-opacity": 1,
            fill: "#41d686",
            "fill-opacity": 0.45,
        },
        corte_av: {
            stroke: "#e11d48",
            "stroke-width": 2,
            "stroke-opacity": 1,
            fill: "#fca5a5",
            "fill-opacity": 0.35,
        },
        rua: {
            stroke: "#555555",
            "stroke-width": 2,
            "stroke-opacity": 1,
            fill: "#000000",
            "fill-opacity": 0, // sem preenchimento pra rua
        },
        manual: {
            stroke: "#d97706",
            "stroke-width": 2,
            "stroke-opacity": 1,
            fill: "#fcd34d",
            "fill-opacity": 0.3,
        },
        overlay: {
            stroke: "#2f6db3",
            "stroke-width": 1.5,
            "stroke-opacity": 1,
            fill: "#2f6db3",
            "fill-opacity": 0.08,
        },
        margem: {
            stroke: "#ff8800",
            "stroke-width": 2,
            "stroke-opacity": 1,
            fill: "#000000",
            "fill-opacity": 0,
        },

        rua_mask: {
            stroke: "#4b5563",
            "stroke-width": 1,
            "stroke-opacity": 1,
            fill: "#9ca3af",
            "fill-opacity": 0.4,
        },
    };

    function withRoleStyle(role, baseProps = {}) {
        const style = ROLE_STYLES[role] || {};
        return { ...baseProps, role, ...style };
    }


    // ---------- GEOJSON para exportar KML/KMZ (frontend) ----------
    const buildExportGeoJSON = () => {
        const features = [];

        // 1) AOI
        if (aoi?.geometry) {
            features.push({
                type: "Feature",
                geometry: aoi.geometry,
                properties: withRoleStyle("aoi", {
                    name: "AOI",
                }),
            });
        }

        // 2) Área loteável (se existir)
        if (areaLoteavel?.geometry) {
            features.push({
                type: "Feature",
                geometry: areaLoteavel.geometry,
                properties: withRoleStyle("area_loteavel", {
                    name: "Área loteável",
                }),
            });
        }

        // 3) Áreas verdes
        (areasVerdes || []).forEach((f, idx) => {
            if (!f?.geometry) return;
            const props = f.properties || {};
            const nm = props.name || props.label || `Área verde ${idx + 1}`;
            features.push({
                type: "Feature",
                geometry: f.geometry,
                properties: withRoleStyle("area_verde", {
                    ...props,
                    name: nm,
                }),
            });
        });

        // 4) Cortes
        (cortes || []).forEach((f, idx) => {
            if (!f?.geometry) return;
            const props = f.properties || {};
            const nm = props.name || props.label || `Corte área verde ${idx + 1}`;
            features.push({
                type: "Feature",
                geometry: f.geometry,
                properties: withRoleStyle("corte_av", {
                    ...props,
                    name: nm,
                }),
            });
        });

        // 5) Ruas (eixo)
        (ruasState || []).forEach((f, idx) => {
            if (!f?.geometry) return;
            const props = f.properties || {};
            const largura =
                Number.isFinite(+props.width_m)
                    ? +props.width_m
                    : Number.isFinite(+defaultRuaWidth)
                        ? +defaultRuaWidth
                        : 12;
            const nm = props.name || `Rua ${idx + 1} (${largura} m)`;
            features.push({
                type: "Feature",
                geometry: f.geometry,
                properties: withRoleStyle("rua", {
                    ...props,
                    name: nm,
                    width_m: largura,
                }),
            });
        });

        // 5.1) Máscara de ruas (buffers) – se existir
        if (ruaMask?.features?.length) {
            ruaMask.features.forEach((f, idx) => {
                if (!f?.geometry) return;
                const props = f.properties || {};
                const nm =
                    props.name ||
                    `Máscara rua ${props._rua_uid != null ? props._rua_uid : idx + 1}`;
                features.push({
                    type: "Feature",
                    geometry: f.geometry,
                    properties: withRoleStyle("rua_mask", {
                        ...props,
                        name: nm,
                    }),
                });
            });
        }

        // 6) Restrições manuais (polígonos + círculos convertidos)
        (restrManuais || []).forEach((f, idx) => {
            if (!f?.geometry) return;
            const props = f.properties || {};
            const nm = props.name || props.label || `Restrição manual ${idx + 1}`;
            features.push({
                type: "Feature",
                geometry: f.geometry,
                properties: withRoleStyle("manual", {
                    ...props,
                    name: nm,
                }),
            });
        });

        // 7) Overlays do backend (apenas os visíveis)
        Object.entries(extrasByOverlay || {}).forEach(([overlayId, pack]) => {
            if (!overlayVisible[overlayId]) return;
            (pack.features || []).forEach((f, idx) => {
                if (!f?.geometry) return;
                const props = f.properties || {};
                const nm =
                    props.name ||
                    props.label ||
                    `Overlay ${overlayId} #${idx + 1}`;
                features.push({
                    type: "Feature",
                    geometry: f.geometry,
                    properties: withRoleStyle("overlay", {
                        ...props,
                        name: nm,
                        overlay_id: overlayId,
                    }),
                });
            });
        });

        // 8) Margens
        Object.entries(marginGeoByOverlay || {}).forEach(([overlayId, fc]) => {
            (fc?.features || []).forEach((f, idx) => {
                if (!f?.geometry) return;
                const props = f.properties || {};
                const nm =
                    props.name ||
                    props.label ||
                    `Margem ${overlayId} #${idx + 1}`;
                features.push({
                    type: "Feature",
                    geometry: f.geometry,
                    properties: withRoleStyle("margem", {
                        ...props,
                        name: nm,
                        overlay_id: overlayId,
                    }),
                });
            });
        });

        return {
            type: "FeatureCollection",
            features,
        };
    };




    async function salvarRestricoesVersao() {
        if (!projetoSel) {
            Swal.fire({
                icon: "warning",
                title: "Selecione um projeto",
                text: "Você precisa selecionar um projeto antes de salvar restrições.",
            });
            return;
        }

        try {
            setIsSaving(true);

            const payload = {
                label: labelVersao || "",
                notes: "gerado no Geoman",
                percent_permitido: Number(percentPermitido || 0) || null,
                corte_pct_cache: cortePct ?? null,
                source: "geoman",
                adHoc: buildAdHocRestricoes(),
            };

            let resp;
            if (restricaoSelId) {
                // EDITAR restrição existente (PUT /restricoes/<id>/)
                resp = await axiosAuth.put(
                    `/restricoes/${restricaoSelId}/`,
                    payload
                );
                Swal.fire({
                    icon: "success",
                    title: "Versão atualizada",
                    text: `Restrição #${restricaoSelId} atualizada com sucesso.`,
                });
            } else {
                // CRIAR nova versão para o projeto (POST /projetos/<id>/restricoes/)
                resp = await axiosAuth.post(
                    `/projetos/${projetoSel}/restricoes/`,
                    payload
                );
                const data = resp.data;
                Swal.fire({
                    icon: "success",
                    title: "Versão salva",
                    text: `Versão v${data.version} criada para o projeto.`,
                });
                // coloca o id recém criado como selecionado, se quiser
                if (data.id) {
                    setRestricaoSelId(data.id);
                    syncUrlRestricoes(data.id);
                }
            }

            // recarrega a lista de versões do projeto atual
            await carregarVersoesRestricoes(projetoSel);
        } catch (e) {
            console.error("[salvar restrições] erro:", e);
            Swal.fire({
                icon: "error",
                title: "Erro ao salvar",
                text: "Não foi possível salvar as restrições.",
            });
        } finally {
            setIsSaving(false);
        }
    }

    async function deletarRestricaoAtual() {
        if (!restricaoSelId) {
            Swal.fire({
                icon: "warning",
                title: "Nenhuma versão selecionada",
                text: "Selecione uma versão de restrições para excluir.",
            });
            return;
        }

        const confirm = await Swal.fire({
            icon: "warning",
            title: "Excluir esta versão?",
            text: "Essa ação não pode ser desfeita.",
            showCancelButton: true,
            confirmButtonText: "Sim, excluir",
            cancelButtonText: "Cancelar",
            confirmButtonColor: "#dc2626",
            cancelButtonColor: "#6b7280",
        });

        if (!confirm.isConfirmed) return;

        try {
            await axiosAuth.delete(`/restricoes/${restricaoSelId}/`);

            Swal.fire({
                icon: "success",
                title: "Versão excluída",
            });

            // remove da lista local
            setRestricoesVersoes((prev) =>
                prev.filter((r) => r.id !== restricaoSelId)
            );

            // Se também estiver na lista global de restrições do dono
            setRestricoesTodas((prev) =>
                prev.filter((r) => r.id !== restricaoSelId)
            );

            // limpa seleção e URL
            setRestricaoSelId(null);
            syncUrlRestricoes(null);

            // limpa mapa (ou recarrega o projeto base)
            setAreasVerdes([]);
            setCortes([]);
            setRestrManuais([]);
            setAreaLoteavel(null);
            setAoi(null);
            avLayerByUid.current = new Map();
            corteLayerByUid.current = new Map();
            setMarginGeoByOverlay({});
            setMarginUiByOverlay({});
            setMarginVersionByOverlay({});
            setExtrasByOverlay({});
            setOverlayVisible({});

            // se quiser, recarrega o projeto base
            if (projetoSel) {
                abrirProjeto(projetoSel);
            }
        } catch (e) {
            console.error("[Geoman] erro ao excluir restrição:", e);
            Swal.fire({
                icon: "error",
                title: "Erro ao excluir",
                text: "Não foi possível excluir esta versão de restrições.",
            });
        }
    }




    async function exportarKmlKmz() {
        // 1) Garante que tem alguma geometria pra exportar
        const fc = buildExportGeoJSON();
        if (!fc?.features?.length) {
            Swal.fire({
                icon: "warning",
                title: "Nada para exportar",
                text: "Não há geometrias no mapa para exportar.",
            });
            return;
        }

        // 2) Converte o FeatureCollection em string KML
        let kmlString;
        try {
            kmlString = tokml(fc, {
                name: "name",
                description: "description",
                simplestyle: true,   // <- isso faz o tokml ler stroke/fill/etc.
            });

        } catch (e) {
            console.error("[exportarKmlKmz] erro ao gerar KML:", e);
            Swal.fire({
                icon: "error",
                title: "Erro na conversão",
                text: "Erro ao gerar o KML no frontend.",
            });
            return;
        }

        // 3) Define nome base do arquivo (se tiver projeto selecionado, usa o nome)
        let filenameBase = "restricoes_mapa";
        if (projetoSel) {
            const p = projetos.find((proj) => proj.id === projetoSel);
            if (p) {
                filenameBase = (p.name || `projeto_${projetoSel}`) + "_restricoes";
            }
        }

        try {
            let blob;
            let filename;

            if (outFormat === "kml") {
                // Exporta KML simples
                blob = new Blob([kmlString], {
                    type: "application/vnd.google-earth.kml+xml",
                });
                filename = `${filenameBase}.kml`;
            } else {
                // Exporta KMZ (zip com doc.kml dentro)
                const zip = new JSZip();
                zip.file("doc.kml", kmlString);
                const content = await zip.generateAsync({ type: "blob" });
                blob = content;
                filename = `${filenameBase}.kmz`;
            }

            // 4) Dispara o download
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            console.error("[exportarKmlKmz] erro final:", e);
            Swal.fire({
                icon: "error",
                title: "Erro ao exportar",
                text: "Não foi possível gerar o arquivo KML/KMZ.",
            });
        }
    }



    async function carregarVersoesRestricoes(projectId) {
        setRestricoesVersoes([]);
        setRestricaoSelId(null);

        if (!projectId) return;

        try {
            const { data: list } = await axiosAuth.get(
                `/projetos/${projectId}/restricoes/list/`
            );
            setRestricoesVersoes(list || []);
        } catch (e) {
            console.error("[Geoman] Erro ao carregar versões de restrições:", e);
            Swal.fire({
                icon: "error",
                title: "Erro ao carregar restrições",
                text: "Não foi possível carregar as versões de restrições deste projeto.",
            });
        }
    }


    useEffect(() => {
        // sempre que trocar o projeto, recarrega as versões de restrições
        if (projetoSel) {
            carregarVersoesRestricoes(projetoSel);
        } else {
            setRestricoesVersoes([]);
            setRestricaoSelId(null);
        }
    }, [projetoSel]);

    // Se a URL já vier com ?restricoesId=123, abre essa versão automaticamente
    useEffect(() => {
        try {
            const url = new URL(window.location.href);
            const rid = url.searchParams.get("restricoesId");
            if (rid) {
                const idNum = Number(rid);
                if (Number.isFinite(idNum)) {
                    abrirVersaoRestricoes(idNum);
                }
            }
        } catch {
            // ignora erro de URL
        }
    }, []);

    async function abrirVersaoRestricoes(restricoesId) {
        if (!restricoesId) return;

        try {
            const { data } = await axiosAuth.get(`/restricoes/${restricoesId}/geo/`);

            // 1) Garante que o projeto dessa restrição está selecionado
            if (data.project_id) {
                setProjetoSel(data.project_id);
                const p = projetos.find((pp) => pp.id === data.project_id);
                if (p) {
                    setProjetoQuery(p.name || `Projeto #${p.id}`);
                }
            }

            // 2) Limpa estados atuais (mapa "zerado" antes de aplicar a versão)
            setAoi(null);
            setAreaLoteavel(null);
            setAreasVerdes([]);
            setCortes([]);
            setRestrManuais([]);
            avLayerByUid.current = new Map();
            corteLayerByUid.current = new Map();

            // limpa ruas
            try {
                (ruasState || []).forEach((r) => {
                    const uid = r?.properties?._uid;
                    if (uid != null) {
                        removeRua(uid);
                    }
                });
            } catch { }

            // limpa overlays + margens
            setExtrasByOverlay({});
            setOverlayVisible({});
            setMarginUiByOverlay({});
            setMarginGeoByOverlay({});
            setMarginVersionByOverlay({});

            const acc = [];

            // 3) AOI
            if (data.aoi) {
                const aoiFeat = featureWithOriginal(
                    { type: "Feature", geometry: data.aoi },
                    "geojson"
                );
                setAoi(aoiFeat);
                setAoiAreaM2(areaM2Of(aoiFeat));
                acc.push(aoiFeat);
            }

            // 4) Área loteável (se existir)
            if (data.area_loteavel?.features?.length) {
                const feat = data.area_loteavel.features[0];
                const loteavelFeat = featureWithOriginal(feat, "geojson");
                setAreaLoteavel(loteavelFeat);
                acc.push(...data.area_loteavel.features);
            }

            // 5) Áreas verdes (av)
            if (data.av?.features?.length) {
                data.av.features.forEach((f) => {
                    addAreaVerdeFromGJ(f);
                    acc.push(f);
                });
            }

            // 6) Cortes (corte_av)
            if (data.corte_av?.features?.length) {
                data.corte_av.features.forEach((f) => {
                    addCorteFromGJ(f);
                    acc.push(f);
                });
            }

            // 7) Ruas (ruas_eixo)
            if (data.ruas_eixo?.features?.length) {
                data.ruas_eixo.features.forEach((f) => {
                    const w = Number(f?.properties?.width_m);
                    const largura = Number.isFinite(w) && w > 0 ? w : defaultRuaWidth;
                    addRuaFromGJ(f, largura);
                    acc.push(f);
                });
            }

            // 8) Restrições manuais (manuais)
            if (data.manuais?.features?.length) {
                const listaManuais = data.manuais.features.map((f, idx) => ({
                    type: "Feature",
                    geometry: f.geometry,
                    properties: {
                        ...(f.properties || {}),
                        _uid: f.properties?._uid ?? `m-${restricoesId}-${idx}`,
                        role: "manual",
                    },
                }));
                setRestrManuais(listaManuais);
                acc.push(...data.manuais.features);
            }

            // 9) RIOS / LT / FERROVIAS -> overlays + margens
            const newExtras = {};
            const newOverlayVisible = {};
            const newMarginUi = {};
            const newMarginGeo = {};
            const newMarginVer = {};

            const addOverlayFromCenterline = (
                centerFc,
                faixaFc,
                overlayId,
                color,
                defaultDist
            ) => {
                if (!centerFc?.features?.length) return;

                // overlay (eixo)
                newExtras[overlayId] = {
                    features: centerFc.features.map((f) =>
                        featureWithOriginal(f, "geojson")
                    ),
                    color,
                };
                newOverlayVisible[overlayId] = true;

                // distância default da margem
                let dist = defaultDist;
                const firstProps = centerFc.features[0].properties || {};
                if (Number.isFinite(+firstProps.margem_m) && +firstProps.margem_m > 0) {
                    dist = +firstProps.margem_m;
                }
                newMarginUi[overlayId] = { dist, show: true };

                // faixa salva no backend (margem) → entra direto como marginGeoByOverlay
                if (faixaFc?.features?.length) {
                    newMarginGeo[overlayId] = toFeatureCollection(faixaFc);
                    newMarginVer[overlayId] = 1;
                    acc.push(...faixaFc.features);
                }

                // também soma os eixos pro zoom geral
                acc.push(...centerFc.features);
            };

            // mesmos defaults que você usa no buildAdHocRestricoes
            addOverlayFromCenterline(
                data.rios_centerline,
                data.rios_faixa,
                "rios",
                "#1d4ed8",
                30
            );
            addOverlayFromCenterline(
                data.lt_centerline,
                data.lt_faixa,
                "lt",
                "#dc2626",
                15
            );
            addOverlayFromCenterline(
                data.ferrovias_centerline,
                data.ferrovias_faixa,
                "ferrovias",
                "#16a34a",
                20
            );

            setExtrasByOverlay(newExtras);
            setOverlayVisible(newOverlayVisible);
            setMarginUiByOverlay(newMarginUi);
            setMarginGeoByOverlay(newMarginGeo);
            setMarginVersionByOverlay(newMarginVer);

            // 10) Marca restrição selecionada + URL
            setRestricaoSelId(restricoesId);
            syncUrlRestricoes(restricoesId);

            // 11) Dá ZOOM em tudo que carregou
            if (mapRef.current && acc.length) {
                const fc = {
                    type: "FeatureCollection",
                    features: acc.map((f) =>
                        f.type === "Feature"
                            ? f
                            : {
                                type: "Feature",
                                geometry: f.geometry || f,
                                properties: f.properties || {},
                            }
                    ),
                };
                fitToFeatures(mapRef.current, fc);
            }

            // 12) Recalcula métricas (área verde, corte, etc.)
            setTimeout(() => {
                try {
                    recalcRef.current?.();
                } catch { }
            }, 0);
        } catch (e) {
            console.error("[Geoman] Erro ao abrir versão de restrições:", e);
            Swal.fire({
                icon: "error",
                title: "Erro ao abrir restrição",
                text: "Não foi possível abrir a versão selecionada.",
            });
        }
    }

    // Carrega todas as restrições do DONO (para o autocomplete "Editar restrições")
    async function carregarRestricoesDoDono() {
        try {
            const { data } = await axiosAuth.get("/restricoes/todas-do-dono/");
            setRestricoesTodas(data || []);
        } catch (e) {
            console.error("[Geoman] erro ao listar restrições do dono:", e);
            Swal.fire({
                icon: "error",
                title: "Erro ao carregar restrições",
                text: "Não foi possível carregar as restrições salvas.",
            });
        }
    }

    // Mantém o ID da restrição na URL (?restricoesId=123) para poder compartilhar o link
    const syncUrlRestricoes = useCallback((restricoesId) => {
        try {
            const url = new URL(window.location.href);
            if (restricoesId) {
                url.searchParams.set("restricoesId", String(restricoesId));
            } else {
                url.searchParams.delete("restricoesId");
            }
            window.history.replaceState({}, "", url.toString());
        } catch {
            // se der erro, ignora
        }
    }, []);


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

            {/* Painel principal (projetos / AV / Ruas / Loteável) */}
            <div className={`absolute z-[1000] ${isFullscreen ? "bottom-5" : "bottom-30"
                } left-2 bg-white/80 rounded-xl shadow p-3 space-y-3 max-w-[1080px]`}>
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
                            placeholder="Criar restrições (escolha um projeto)…"
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
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                            setProjetoSel(p.id);
                                            setProjetoQuery(p.name || `Projeto #${p.id}`);
                                            setIsProjetosOpen(false);

                                            // modo CRIAR: limpa restrição selecionada
                                            setRestricaoSelId(null);
                                            syncUrlRestricoes(null);

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
                    {/* Autocomplete para EDITAR restrições salvas */}
                    <div
                        className="relative w-full mt-2"
                        tabIndex={-1}
                        onBlur={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget)) {
                                setIsRestricoesOpen(false);
                            }
                        }}
                    >
                        <input
                            className="border p-2 rounded w-full text-sm"
                            placeholder="Editar restrições salvas…"
                            value={restricoesQuery}
                            onFocus={() => {
                                setIsRestricoesOpen(true);
                                // carrega a lista apenas na primeira vez, se ainda estiver vazia
                                if (!restricoesTodas.length) {
                                    carregarRestricoesDoDono();
                                }
                            }}
                            onChange={(e) => {
                                setRestricoesQuery(e.target.value);
                                setIsRestricoesOpen(true);
                            }}
                        />

                        {isRestricoesOpen && (
                            <div className="absolute left-0 right-0 mt-1 max-h-56 overflow-auto border rounded bg-white z-[1200]">
                                {restricoesFiltradas.map((r) => (
                                    <button
                                        key={r.id}
                                        type="button"
                                        className="w-full text-left px-2 py-1 text-sm hover:bg-gray-100"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                            setIsRestricoesOpen(false);
                                            setRestricoesQuery(
                                                r.label ||
                                                `Restrição #${r.id} - ${r.project_name || ""}`
                                            );

                                            // garante que o projeto selecionado é o mesmo da restrição
                                            if (r.project) {
                                                setProjetoSel(r.project);
                                                setProjetoQuery(r.project_name || `Projeto #${r.project}`);
                                            }

                                            // entra em modo EDITAR
                                            setRestricaoSelId(r.id);
                                            syncUrlRestricoes(r.id);
                                            abrirVersaoRestricoes(r.id);
                                        }}
                                    >
                                        {r.label || `Restrição #${r.id}`}{" "}
                                        {r.project_name && (
                                            <span className="text-xs text-gray-500">
                                                – {r.project_name}
                                            </span>
                                        )}
                                    </button>
                                ))}

                                {!restricoesFiltradas.length && (
                                    <div className="px-2 py-1 text-xs text-gray-500">
                                        Nenhuma restrição encontrada
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
                        {/* Polígono Manual */}
                        <button
                            onClick={async () => {
                                const { value: nm } = await Swal.fire({
                                    title: "Nome da restrição (polígono)",
                                    input: "text",
                                    inputPlaceholder: "Digite o nome da restrição...",
                                    showCancelButton: true,
                                    confirmButtonText: "Continuar",
                                    cancelButtonText: "Cancelar",
                                    confirmButtonColor: "#16a34a",
                                    cancelButtonColor: "#6b7280",
                                    inputValidator: (value) => {
                                        if (!value || !value.trim()) {
                                            return "Informe um nome para a restrição.";
                                        }
                                        return null;
                                    },
                                });

                                // Cancelou
                                if (!nm || !nm.trim()) return;

                                window.__manualName = nm.trim();
                                setDrawMode("manualPolygon");
                                setDrawNonce((n) => n + 1);
                            }}
                            className="px-3 py-2 rounded bg-amber-700 text-white"
                            title="Desenhar polígono manual (com nome)"
                        >
                            Polígono Manual
                        </button>

                        {/* Círculo Manual */}
                        <button
                            onClick={async () => {
                                // 1) Primeiro pergunta o nome
                                const { value: nm } = await Swal.fire({
                                    title: "Nome da restrição (círculo)",
                                    input: "text",
                                    inputPlaceholder: "Digite o nome da restrição...",
                                    showCancelButton: true,
                                    confirmButtonText: "Continuar",
                                    cancelButtonText: "Cancelar",
                                    confirmButtonColor: "#16a34a",
                                    cancelButtonColor: "#6b7280",
                                    inputValidator: (value) => {
                                        if (!value || !value.trim()) {
                                            return "Informe um nome para a restrição.";
                                        }
                                        return null;
                                    },
                                });

                                if (!nm || !nm.trim()) return; // cancelou

                                // 2) Depois pergunta o raio
                                const { value: raioStr } = await Swal.fire({
                                    title: "Raio do círculo (em metros)",
                                    input: "number",
                                    inputPlaceholder: "Ex: 50",
                                    showCancelButton: true,
                                    confirmButtonText: "Continuar",
                                    cancelButtonText: "Cancelar",
                                    confirmButtonColor: "#16a34a",
                                    cancelButtonColor: "#6b7280",
                                    inputAttributes: {
                                        min: "0.1",
                                        step: "0.1",
                                    },
                                    inputValidator: (value) => {
                                        if (!value) {
                                            return "Informe o raio em metros.";
                                        }
                                        const n = Number(value);
                                        if (!Number.isFinite(n) || n <= 0) {
                                            return "Raio inválido. Use um número maior que zero.";
                                        }
                                        return null;
                                    },
                                });

                                if (raioStr === undefined) return; // cancelou

                                const raio = Number(raioStr);

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
                    <button
                        onClick={async () => {
                            if (!ruasState.length) return;
                            const res = await Swal.fire({
                                icon: "warning",
                                title: "Remover todas as ruas?",
                                text: "Essa ação não pode ser desfeita.",
                                showCancelButton: true,
                                confirmButtonText: "Sim, remover",
                                cancelButtonText: "Cancelar",
                                confirmButtonColor: "#dc2626",
                                cancelButtonColor: "#6b7280",
                            });
                            if (res.isConfirmed) {
                                limparRuas();
                            }
                        }}
                        className="px-3 py-2 rounded bg-red-600 text-white"
                        title="Remover todas as ruas desenhadas"
                    >
                        Limpar ruas
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
                    <div className="flex gap-2">
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

                        <button
                            onClick={deletarRestricaoAtual}
                            disabled={!restricaoSelId}
                            className={`px-3 py-2 rounded ${!restricaoSelId
                                ? "bg-gray-300 text-gray-600"
                                : "bg-red-600 text-white"
                                }`}
                            title="Excluir versão de restrições selecionada"
                        >
                            Excluir versão
                        </button>
                    </div>
                </div>


                {/* Exportar KML/KMZ (separado do salvar) */}
                <div className="flex items-center gap-2 mt-3">
                    <select
                        className="border p-2 rounded text-sm"
                        value={outFormat}
                        onChange={(e) => setOutFormat(e.target.value)}
                    >
                        <option value="kmz">KMZ (compacto)</option>
                        <option value="kml">KML</option>
                    </select>
                    <button
                        onClick={exportarKmlKmz}
                        className="px-3 py-2 rounded bg-blue-700 text-white"
                        title="Gerar arquivo KML/KMZ com as geometrias atuais do mapa"
                    >
                        Exportar {outFormat.toUpperCase()}
                    </button>
                </div>


            </div>

            {/* Painel de Camadas do Backend (visíveis por padrão) + Margens (somente linhas) */}
            <div className={`absolute z-[1000] ${isFullscreen ? "bottom-5" : "bottom-30"
                } left-150 bg-white/80 rounded-xl shadow p-3 space-y-2 min-w-[460px] max-w-[700px]`}>
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
                                            showAlert("Linha muito curta. Desenhe com pelo menos dois pontos.", {
                                                icon: "warning",
                                                title: "Linha muito curta",
                                            });
                                        }
                                    } else {
                                        // MultiLineString → mantém só partes com 2+ pontos
                                        const has2 = (coords) => Array.isArray(coords) && coords.length >= 2;
                                        const parts = (g.coordinates || []).filter(has2);
                                        if (!parts.length) {
                                            showAlert("Linha inválida.", {
                                                icon: "warning",
                                                title: "Geometria inválida",
                                            });
                                        }
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
                        onRuaEdited={(uid, gj) => {
                            updateRuaGeometry(uid, gj);
                            scheduleRecalc();            // recalcula área loteável após mexer na rua
                        }}
                        onRuaRemoved={(uid) => {
                            removeRua(uid);              // remove rua do estado (linha + máscara)
                            scheduleRecalc();            // recalcula área loteável após apagar
                        }}
                        onRuaWidthPrompt={(uid, current) => {
                            const val = window.prompt("Largura desta rua (m):", String(current));
                            if (val == null) return;
                            const width = Number(val);
                            if (!Number.isFinite(width) || width <= 0) return;
                            updateRuaWidth(uid, width);
                            scheduleRecalc();            // recalcula após mudar largura
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
                                filter={(feat) => {
                                    const g = feat?.geometry;
                                    if (!g) return false;
                                    const t = g.type;
                                    if (t === "LineString" || t === "MultiLineString") {
                                        return isValidLineGeom(g);
                                    }
                                    if (t === "Polygon" || t === "MultiPolygon") {
                                        // deixa passar as faixas em área vindas do backend
                                        return true;
                                    }
                                    return false;
                                }}

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
