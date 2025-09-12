// src/pages/geoman/GeomanLoteador.jsx
// múltiplas AVs + múltiplos cortes, edição garantida pós-add,
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
import useAxios from "../../utils/useAxios";

import AreaVerde from "./components/AreaVerde";
import useAreaVerde from "./components/useAreaVerde";
import {
    fitToFeatures,
    featureWithOriginal,
    extendLineString,
} from "./geoUtils";

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

// ---------- Global rAF para recálculo (escuta eventos PM) ----------
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

// ---------- Componente principal ----------
export default function GeomanLoteador() {
    const axiosAuth = useAxios();
    const mapRef = useRef(null);

    // Refs de layers vivos (Leaflet)
    const avLayerByUid = useRef(new Map());     // uid -> L.Polygon (cada AV)
    const corteLayerByUid = useRef(new Map());  // uid -> L.Polygon (cada Corte)

    // Hook que concentra lógica de AV/Corte
    const {
        areasVerdes, setAreasVerdes,
        cortes, setCortes,
        areaLoteavel, setAreaLoteavel,
        avAreaM2, cortesAreaM2, cortePct,
        percentPermitido, setPercentPermitido,
        addAreaVerdeFromGJ,
        addCorteFromGJ,
        limparCortes,
        gerarAreaLoteavel,
        syncLayerToState,
        recomputePreview,
        recalcRef,
        seqRef,
    } = useAreaVerde({
        avLayerByUidRef: avLayerByUid,
        corteLayerByUidRef: corteLayerByUid,
        fitToMap: (f) => { if (mapRef.current) fitToFeatures(mapRef.current, f); },
    });

    // rAF local para acionar o recalc do hook sem custo
    const recalcRAF = useRef(null);
    const scheduleRecalc = useCallback(() => {
        if (recalcRAF.current) return;
        recalcRAF.current = requestAnimationFrame(() => {
            recalcRAF.current = null;
            try { recalcRef.current?.(); } catch { }
        });
    }, [recalcRef]);
    useEffect(() => () => { if (recalcRAF.current) cancelAnimationFrame(recalcRAF.current); }, []);

    // Projetos
    const [projetos, setProjetos] = useState([]);
    const [projetoSel, setProjetoSel] = useState("");

    // Outras camadas
    const [aoi, setAoi] = useState(null);
    const [ruas, setRuas] = useState([]);
    const [lotes, setLotes] = useState([]);

    // Overlays externos
    const [extrasByOverlay, setExtrasByOverlay] = useState({});

    // Visibilidade
    const [visible, setVisible] = useState({
        aoi: true, areasVerdes: true, loteavel: true, cortes: true, ruas: true, lotes: true, overlays: {},
    });

    // UI / ferramentas
    const [drawMode, setDrawMode] = useState("none");
    const [drawNonce, setDrawNonce] = useState(0);
    const [extendMeters, setExtendMeters] = useState(20);
    const [showAreaVerde, setShowAreaVerde] = useState(false);

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

        // Áreas Verdes (todas)
        const avFeats = feats.filter(
            (f) => f.properties?.role === "area_verde" && ["Polygon", "MultiPolygon"].includes(f.geometry?.type)
        );
        if (avFeats.length) {
            setAreasVerdes((prev) => {
                if (prev.length) return prev; // evita duplicar quando vários overlays
                const list = avFeats.map((f) => {
                    const avNorm = f.type === "Feature" ? f : { type: "Feature", geometry: f.geometry, properties: f.properties || {} };
                    const withSeq = featureWithOriginal(avNorm, "geojson");
                    withSeq.properties._uid = ++seqRef.current.av;
                    return withSeq;
                });
                return list;
            });
            scheduleRecalc();
        }

        // Ruas
        const ruasFeats = feats.filter((f) => f.properties?.role === "rua" && ["LineString", "MultiLineString"].includes(f.geometry?.type));
        if (ruasFeats.length) {
            const list = ruasFeats.map((f) => featureWithOriginal(f, "geojson"));
            setRuas((prev) => [...prev, ...list]);
        }

        // Lotes
        const lotPolys = feats.filter((f) => f.properties?.role === "lote" && ["Polygon", "MultiPolygon"].includes(f.geometry?.type));
        if (lotPolys.length) {
            const list = lotPolys.map((f) => featureWithOriginal(f, "geojson"));
            setLotes((prev) => [...prev, ...list]);
        }
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
        setVisible((prev) => ({ ...prev, overlays: {} }));

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
            {/* Painel primário (geral) */}
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

                    {/* Toggle painel Área Verde */}
                    <button
                        onClick={() => setShowAreaVerde((v) => !v)}
                        className={`px-3 py-2 rounded ${showAreaVerde ? "bg-emerald-700 text-white" : "bg-gray-100"}`}
                        title="Abrir painel de Área Verde/Corte"
                    >
                        Área Verde
                    </button>
                </div>

                {/* Estender ruas */}
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

                {/* Gerar Área Loteável */}
                <button
                    onClick={gerarAreaLoteavel}
                    className="px-3 py-2 rounded bg-blue-700 text-white"
                    title="Gerar Área Loteável (união(AVs − união(cortes))) sem alterar as AVs"
                >
                    Gerar Área Loteável
                </button>
            </div>

            {/* Painel Área Verde (flutuante topo) */}
            <AreaVerde
                open={showAreaVerde}
                onClose={() => setShowAreaVerde(false)}
                onDrawAreaVerde={() => { setDrawMode("areaVerde"); setDrawNonce((n) => n + 1); }}
                onDrawCorte={() => { setDrawMode("corteLayer"); setDrawNonce((n) => n + 1); }}
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
                            if (mode === "areaVerde") { addAreaVerdeFromGJ(gj); return; }
                            if (mode === "corteLayer") { addCorteFromGJ(gj); return; }
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
        </div >
    );
}
