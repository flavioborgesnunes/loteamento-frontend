// src/pages/geoman/ParcelamentoPanel.jsx
import React, { useEffect, useRef, useState } from "react";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import L from "leaflet";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import "@geoman-io/leaflet-geoman-free";

import useParcelamentoApi from "../parcelamento/parcelamento";

// IDs Mapbox (mantidos)
const SRC_VIAS = "parcel_vias";
const SRC_QUART = "parcel_quarts";
const SRC_LOTES = "parcel_lotes";
const LYR_VIAS = "parcel_vias_line";
const LYR_QUART = "parcel_quarts_fill";
const LYR_LOTES = "parcel_lotes_line";

/**
 * ParcelamentoPanel
 * Props:
 *  - map: pode ser um MapboxGL.Map **ou** um Leaflet.Map (com Geoman)
 *  - planoId: number | null
 *  - alFeature: GeoJSON Feature
 *  - onPreview?: (data) => void
 *  - onMaterialize?: (versaoId) => void
 *  - extraParams?: objeto com { ruas_mask_fc, ruas_eixo_fc, guia_linha_fc, ... }
 */
export default function ParcelamentoPanel({
    map = null,
    planoId,
    alFeature,
    onPreview,
    onMaterialize,
    extraParams = {},
}) {
    const {
        previewParcelamento,
        materializarParcelamento,
        getVersaoGeojson,
        exportVersaoKML,
    } = useParcelamentoApi();

    const [params, setParams] = useState({
        frente_min_m: 10,
        prof_min_m: 25,
        larg_rua_vert_m: 12,
        larg_rua_horiz_m: 12,
        compr_max_quarteirao_m: 200,
        orientacao_graus: null,
        srid_calc: 3857,
        // NOVO: largura da calçada
        calcada_largura_m: 2.5,
    });

    const [metrics, setMetrics] = useState(null);
    const [versaoId, setVersaoId] = useState(null);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [isMaterializing, setIsMaterializing] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // ===== detecção do tipo de mapa =====
    const isLeaflet = !!(map && map.pm);          // Geoman presente
    const isMapbox = !!(map && map.getSource);   // API Mapbox GL

    // ======== MAPBOX-DRAW (mantido) ========
    const drawRef = useRef(null);
    useEffect(() => {
        if (!isMapbox || drawRef.current) return;
        try {
            const draw = new MapboxDraw({
                displayControlsDefault: false,
                controls: { trash: true, combine_features: false, uncombine_features: false },
                modes: MapboxDraw.modes,
            });
            map.addControl(draw, "top-left");
            drawRef.current = draw;
        } catch (e) {
            console.warn("[ParcelamentoPanel] MapboxDraw não pôde ser inicializado:", e?.message || e);
        }
    }, [isMapbox, map]);

    const upsertSource = (id, data) => {
        if (!isMapbox) return;
        const src = map.getSource(id);
        if (src) src.setData(data);
        else map.addSource(id, { type: "geojson", data });
    };
    const ensureLayers = () => {
        if (!isMapbox) return;
        if (!map.getLayer(LYR_VIAS)) map.addLayer({ id: LYR_VIAS, type: "line", source: SRC_VIAS, paint: { "line-width": 3, "line-color": "#0ea5e9" } });
        if (!map.getLayer(LYR_QUART)) map.addLayer({ id: LYR_QUART, type: "fill", source: SRC_QUART, paint: { "fill-opacity": 0.25, "fill-color": "#0ea5e9" } });
        if (!map.getLayer(LYR_LOTES)) map.addLayer({ id: LYR_LOTES, type: "line", source: SRC_LOTES, paint: { "line-width": 1, "line-color": "#0ea5e9" } });
    };

    // ======== LEAFLET-GEOMAN (mantido) ========
    const viasGroupRef = useRef(null);
    const quartGroupRef = useRef(null);
    const lotesGroupRef = useRef(null);

    useEffect(() => {
        if (!isLeaflet) return;
        const lf = map;

        if (!viasGroupRef.current) {
            viasGroupRef.current = L.layerGroup().addTo(lf);
            quartGroupRef.current = L.layerGroup().addTo(lf);
            lotesGroupRef.current = L.layerGroup().addTo(lf);
        }

        lf.pm.setGlobalOptions({
            snappable: true,
            snapDistance: 30,
            allowSelfIntersection: false,
        });

        const onCreate = (e) => {
            if (e.layer && e.layer instanceof L.Polyline) {
                e.layer.setStyle({ color: "#0ea5e9", weight: 3 });
                e.layer.addTo(viasGroupRef.current);
                try { e.layer.pm.enable({ snappable: true }); } catch { }
            }
        };
        lf.on("pm:create", onCreate);

        return () => { try { lf.off("pm:create", onCreate); } catch { } };
    }, [isLeaflet, map]);

    const clearPreviewLeaflet = () => {
        [viasGroupRef, quartGroupRef, lotesGroupRef].forEach(ref => {
            if (ref.current) ref.current.clearLayers();
        });
    };
    const addGeoJSONEditable = (groupRef, gj, style) => {
        if (!isLeaflet || !gj || !groupRef.current) return 0;
        const layer = L.geoJSON(gj, {
            style: () => style,
            onEachFeature: (f, l) => {
                if (l.pm) { try { l.pm.enable({ snappable: true }); } catch { } }
            }
        }).addTo(groupRef.current);
        return layer.getLayers().length;
    };

    // ======== AÇÕES ========
    const loadPreview = async () => {
        if (!planoId) { alert("Selecione um projeto para criar/obter um Plano de Parcelamento."); return; }
        if (!alFeature?.geometry) { alert("Área Loteável/AOI não encontrada."); return; }

        // inclui calcada_largura_m no merge
        const mergedParams = { ...params, ...(extraParams || {}) };

        // logs enxutos (contagens e primeiros tipos)
        const summarizeFC = (fc) => !fc ? null : {
            type: fc.type,
            n: fc.features?.length || 0,
            g0: fc.features?.[0]?.geometry?.type,
        };

        console.log("[parcelamento] sending params:", {
            frente_min_m: mergedParams.frente_min_m,
            prof_min_m: mergedParams.prof_min_m,
            compr_max_quarteirao_m: mergedParams.compr_max_quarteirao_m,
            calcada_largura_m: mergedParams.calcada_largura_m, // <— novo log
            has_ruas_mask_fc: !!mergedParams.ruas_mask_fc,
            ruas_mask_fc: summarizeFC(mergedParams.ruas_mask_fc),
            has_ruas_eixo_fc: !!mergedParams.ruas_eixo_fc,
            ruas_eixo_fc: summarizeFC(mergedParams.ruas_eixo_fc),
        });

        setIsPreviewing(true);
        try {
            const data = await previewParcelamento(planoId, {
                alGeom: alFeature.geometry,
                params: mergedParams,
            });
            setMetrics(data?.metrics || null);

            if (isMapbox) {
                upsertSource(SRC_VIAS, data?.vias || { type: "FeatureCollection", features: [] });
                upsertSource(SRC_QUART, data?.quarteiroes || { type: "FeatureCollection", features: [] });
                upsertSource(SRC_LOTES, data?.lotes || { type: "FeatureCollection", features: [] });
                ensureLayers();
                if (drawRef.current) {
                    try {
                        drawRef.current.deleteAll();
                        (data?.vias?.features || []).forEach((f) => { if (f.geometry?.type === "LineString") drawRef.current.add(f); });
                    } catch { }
                }
            }

            if (isLeaflet) {
                clearPreviewLeaflet();
                const nVias = addGeoJSONEditable(viasGroupRef, data?.vias, { color: "#0ea5e9", weight: 3 });
                addGeoJSONEditable(quartGroupRef, data?.quarteiroes, { color: "#0ea5e9", weight: 2, fillOpacity: 0.10 });
                addGeoJSONEditable(lotesGroupRef, data?.lotes, { color: "#0ea5e9", weight: 1 });
                try { map.pm.enableGlobalEditMode(); } catch { }
                if (!nVias) { try { map.pm.enableDraw("Line", { snappable: true }); } catch { } }
            }

            onPreview?.(data);
        } catch (e) {
            console.error("[preview parcelamento] erro:", e?.response?.data || e?.message || e);
            alert("Erro no preview do parcelamento. Veja o console.");
        } finally {
            setIsPreviewing(false);
        }
    };

    const handleMaterializar = async () => {
        if (!planoId) { alert("Plano de Parcelamento não definido."); return; }
        if (!alFeature?.geometry) { alert("Área Loteável/AOI não encontrada."); return; }

        // coleta edições de VIAS no Leaflet Geoman (camadas da PRÉVIA)
        let userEdits = {};
        if (map && map.eachLayer && map.pm) {
            try {
                const features = [];
                map.eachLayer((l) => {
                    const isLine = typeof l?.toGeoJSON === "function" && l?.toGeoJSON()?.geometry?.type?.includes("Line");
                    if (isLine) {
                        const gj = l.toGeoJSON();
                        if (gj?.type === "Feature") features.push(gj);
                        else if (gj) features.push({ type: "Feature", geometry: gj.geometry || gj, properties: gj.properties || {} });
                    }
                });
                if (features.length) userEdits.vias = { type: "FeatureCollection", features };
            } catch (e) {
                console.warn("[Leaflet Geoman] falha ao coletar edições:", e?.message || e);
            }
        }

        const mergedParams = { ...params, ...(extraParams || {}) };

        setIsMaterializing(true);
        try {
            const res = await materializarParcelamento(planoId, {
                alGeom: alFeature.geometry,
                params: mergedParams,
                userEdits,
                isOficial: true,
                nota: "",
            });

            const vId = res?.versao_id;
            if (!vId) { alert("Materialização não retornou versao_id."); return; }

            setVersaoId(vId);
            onMaterialize?.(vId);

            if (isMapbox) {
                const gj = await getVersaoGeojson(vId);
                upsertSource(SRC_VIAS, gj.vias || { type: "FeatureCollection", features: [] });
                upsertSource(SRC_QUART, gj.quarteiroes || { type: "FeatureCollection", features: [] });
                upsertSource(SRC_LOTES, gj.lotes || { type: "FeatureCollection", features: [] });
                ensureLayers();
            }
        } catch (e) {
            console.error("[materializar parcelamento] erro:", e?.response?.data || e?.message || e);
            alert("Erro ao materializar. Veja o console.");
        } finally {
            setIsMaterializing(false);
        }
    };

    const handleExportKML = async () => {
        if (!versaoId) { alert("Materialize primeiro para gerar KML."); return; }
        setIsExporting(true);
        try {
            const res = await exportVersaoKML(versaoId);
            alert(`KML gerado em: ${res.kml_path}`);
        } catch (e) {
            console.error("[export KML] erro:", e?.response?.data || e?.message || e);
            alert("Erro ao exportar KML. Veja o console.");
        } finally {
            setIsExporting(false);
        }
    };

    const labelPreview = isPreviewing ? "⏳ Pré-visualizando..." : "Pré-visualizar";
    const labelMaterial = isMaterializing ? "⏳ Materializando..." : "Materializar";
    const labelExport = isExporting ? "⏳ Exportando KML..." : "Exportar KML";

    return (
        <div className="p-3 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <label>Frente mínima (m)
                    <input
                        type="number"
                        className="input"
                        value={params.frente_min_m}
                        onChange={(e) => setParams(p => ({ ...p, frente_min_m: parseFloat(e.target.value) }))}
                    />
                </label>
                <label>Profundidade mínima (m)
                    <input
                        type="number"
                        className="input"
                        value={params.prof_min_m}
                        onChange={(e) => setParams(p => ({ ...p, prof_min_m: parseFloat(e.target.value) }))}
                    />
                </label>
                <label>Larg. rua vertical (m)
                    <input
                        type="number"
                        className="input"
                        value={params.larg_rua_vert_m}
                        onChange={(e) => setParams(p => ({ ...p, larg_rua_vert_m: parseFloat(e.target.value) }))}
                    />
                </label>
                <label>Larg. rua horizontal (m)
                    <input
                        type="number"
                        className="input"
                        value={params.larg_rua_horiz_m}
                        onChange={(e) => setParams(p => ({ ...p, larg_rua_horiz_m: parseFloat(e.target.value) }))}
                    />
                </label>
                <label>Comp. máx quarteirão (m)
                    <input
                        type="number"
                        className="input"
                        value={params.compr_max_quarteirao_m}
                        onChange={(e) => setParams(p => ({ ...p, compr_max_quarteirao_m: parseFloat(e.target.value) }))}
                    />
                </label>
                <label>Orientação (°) (opcional)
                    <input
                        type="number"
                        className="input"
                        value={params.orientacao_graus ?? ""}
                        onChange={(e) => setParams(p => ({ ...p, orientacao_graus: (e.target.value === "" ? null : parseFloat(e.target.value)) }))}
                    />
                </label>

                {/* NOVO: Largura das calçadas */}
                <label className="md:col-span-3">Largura da calçada (m)
                    <input
                        type="number"
                        className="input"
                        step="0.1"
                        min="0"
                        value={params.calcada_largura_m}
                        onChange={(e) => setParams(p => ({ ...p, calcada_largura_m: parseFloat(e.target.value) }))}
                    />
                </label>
            </div>

            <div className="flex gap-2">
                <button className="btn" onClick={loadPreview}
                    disabled={isPreviewing || isMaterializing || !planoId}
                    title={!planoId ? "Selecione um projeto para obter o plano" : ""}>
                    {labelPreview}
                </button>

                <button className="btn" onClick={handleMaterializar}
                    disabled={isMaterializing || isPreviewing || !planoId}
                    title={!planoId ? "Selecione um projeto para obter o plano" : ""}>
                    {labelMaterial}
                </button>

                <button className="btn" onClick={handleExportKML}
                    disabled={isExporting || !versaoId}
                    title={!versaoId ? "Materialize primeiro" : ""}>
                    {labelExport}
                </button>
            </div>

            {metrics && (
                <div className="text-sm opacity-80">
                    <div><b>Vias:</b> {metrics.n_vias}</div>
                    <div><b>Quarteirões:</b> {metrics.n_quarteiroes}</div>
                    <div><b>Lotes:</b> {metrics.n_lotes}</div>
                </div>
            )}
        </div>
    );
}
