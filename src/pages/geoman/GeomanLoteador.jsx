import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import {
    MapContainer,
    TileLayer,
    LayersControl,
    GeoJSON,
    useMap,
    Pane,
} from "react-leaflet";

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
                cutPolygon: false,
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
                try {
                    e.layer.remove();
                } catch { }
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
            map.pm.enableDraw("Polygon", {
                snappable: true,
                snapDistance: 20,
                continueDrawing: true,
            });
        } else if (drawMode === "corteLayer") {
            map.pm.enableDraw("Polygon", {
                snappable: true,
                snapDistance: 20,
                continueDrawing: true,
            });
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
    const [extrasByOverlay, setExtrasByOverlay] = useState({});
    const [visible, setVisible] = useState({
        aoi: true,
        areasVerdes: true,
        loteavel: true,
        cortes: true,
        ruas: true,
        lotes: true,
        overlays: {},
    });

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
    } = useRuas({ aoiForClip: aoi }); // se quiser forçar AOI do backend, passe aqui

    const [drawMode, setDrawMode] = useState("none");
    const [drawNonce, setDrawNonce] = useState(0);
    const [showAreaVerde, setShowAreaVerde] = useState(false);

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
            // substitui/concatena conforme sua regra atual
            // aqui, optamos por concatenar:
            // (se quiser substituir, use setRuas(list))
            // precisamos do setRuas do hook:
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
        setVisible((prev) => ({ ...prev, overlays: {} }));

        try {
            const { data: summary } = await axiosAuth.get(`projetos/${id}/map/summary/`);
            const acc = [];

            if (summary?.aoi) {
                const aoiFeat = featureWithOriginal({ type: "Feature", geometry: summary.aoi }, "geojson");
                setAoi(aoiFeat);
                acc.push(aoiFeat);
            }

            const overlaysList = (summary?.overlays || []).filter(
                (o) => (o?.count || 0) > 0
            );
            setVisible((prev) => ({
                ...prev,
                overlays: overlaysList.reduce((accv, o) => ((accv[o.overlay_id] = true), accv), {}),
            }));

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
                fitToFeatures(mapRef.current, {
                    type: "FeatureCollection",
                    features: acc,
                });
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
            final
                ? { ...final, properties: { ...(final.properties || {}), _uid: "loteavel-ruas" } }
                : null
        );
    }

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

    return (
        <div className="w-full h-full relative">
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
                                if (
                                    gj.geometry.type === "LineString" ||
                                    gj.geometry.type === "MultiLineString"
                                ) {
                                    addRuaFromGJ(gj, defaultRuaWidth);
                                }
                                return;
                            }
                        }}
                    />

                    {aoi && visible.aoi && (
                        <GeoJSON
                            pane="pane-aoi"
                            key="aoi"
                            data={aoi}
                            style={() => ({ color: "#3498db", fillOpacity: 0.08, weight: 2, opacity: 1 })}
                            eventHandlers={{ add: (e) => { try { e.target.options.pmIgnore = true; } catch { } } }}
                        />
                    )}

                    {visible.areasVerdes &&
                        areasVerdes.map((av, i) => (
                            <GeoJSON
                                pane="pane-avs"
                                key={`av-${av?.properties?._uid ?? i}`}
                                data={av}
                                style={() => avStyle}
                                onEachFeature={(feature, layer) => {
                                    try {
                                        const uid = av?.properties?._uid ?? i;
                                        layer._avUid = uid;
                                        // habilita edição quando entra no mapa
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
                                        // eventos "live" → recálculo em tempo real
                                        const recalcLive = () => scheduleRecalc();
                                        layer.on("pm:markerdrag", recalcLive);
                                        layer.on("pm:snap", recalcLive);
                                        layer.on("pm:unsnap", recalcLive);
                                        layer.on("pm:edit", recalcLive);
                                        layer.on("pm:vertexadded", recalcLive);
                                        layer.on("pm:vertexremoved", recalcLive);
                                        layer.on("pm:drag", recalcLive);
                                        // fim da edição → sincroniza estado e recalc
                                        const syncEnd = () => {
                                            syncLayerToState("av", uid, layer);
                                            scheduleRecalc();
                                        };
                                        layer.on("pm:markerdragend", syncEnd);
                                        layer.on("pm:editend", syncEnd);
                                        layer.on("pm:dragend", syncEnd);
                                        // remoção
                                        const onPmRemove = () => {
                                            setAreasVerdes((prev) => prev.filter((it) => (it?.properties?._uid ?? null) !== uid));
                                            scheduleRecalc();
                                        };
                                        layer.on("pm:remove", onPmRemove);
                                    } catch { }
                                }}
                            />
                        ))}

                    {areaLoteavel && visible.loteavel && (
                        <GeoJSON
                            pane="pane-loteavel"
                            key={`loteavel-${areaLoteavel?.properties?._uid ?? "0"}`}
                            data={areaLoteavel}
                            style={() => loteavelStyle}
                        />
                    )}

                    {visible.cortes &&
                        cortes.map((c, i) => (
                            <GeoJSON
                                pane="pane-cortes"
                                key={`corte-${c?.properties?._uid ?? i}`}
                                data={c}
                                style={() => corteStyle}
                                onEachFeature={(feature, layer) => {
                                    try {
                                        const uid = c?.properties?._uid ?? i;
                                        layer._corteUid = uid;
                                        // habilita edição
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
                                        // eventos "live"
                                        const recalcLive = () => scheduleRecalc();
                                        layer.on("pm:markerdrag", recalcLive);
                                        layer.on("pm:snap", recalcLive);
                                        layer.on("pm:unsnap", recalcLive);
                                        layer.on("pm:edit", recalcLive);
                                        layer.on("pm:vertexadded", recalcLive);
                                        layer.on("pm:vertexremoved", recalcLive);
                                        layer.on("pm:drag", recalcLive);
                                        // fim da edição
                                        const syncEnd = () => {
                                            syncLayerToState("corte", uid, layer);
                                            scheduleRecalc();
                                        };
                                        layer.on("pm:markerdragend", syncEnd);
                                        layer.on("pm:editend", syncEnd);
                                        layer.on("pm:dragend", syncEnd);
                                        // remoção
                                        const onPmRemove = () => {
                                            setCortes((prev) => prev.filter((it) => (it?.properties?._uid ?? null) !== uid));
                                            scheduleRecalc();
                                        };
                                        layer.on("pm:remove", onPmRemove);
                                    } catch { }
                                }}
                            />
                        ))}

                    {visible.ruas && (
                        <Ruas
                            ruas={ruas}
                            ruaMask={ruaMask}
                            defaultRuaWidth={defaultRuaWidth}
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
                    )}

                    {visible.lotes &&
                        lotes.map((l, i) => (
                            <GeoJSON pane="pane-lotes" key={`lot-${i}`} data={l} style={() => lotStyle} />
                        ))}

                    {/* Extras (se existirem) */}
                    {/* Se você usa extrasByOverlay, renderize-os aqui como no seu original */}
                </MapContainer>
            </div>
        </div>
    );
}
