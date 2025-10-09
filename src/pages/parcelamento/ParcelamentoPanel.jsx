// src/pages/geoman/ParcelamentoPanel.jsx
import React, { useEffect, useRef, useState } from "react";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import useParcelamentoApi from "../parcelamento/parcelamento";

// IDs de fontes/camadas quando o Mapbox map for usado
const SRC_VIAS = "parcel_vias";
const SRC_QUART = "parcel_quarts";
const SRC_LOTES = "parcel_lotes";

const LYR_VIAS = "parcel_vias_line";
const LYR_QUART = "parcel_quarts_fill";
const LYR_LOTES = "parcel_lotes_line";

/**
 * ParcelamentoPanel
 * Props:
 *  - map?: MapboxGL.Map | null
 *  - planoId: number | null
 *  - alFeature: GeoJSON Feature
 *  - onPreview?: (data) => void
 *  - onMaterialize?: (versaoId) => void
 */
export default function ParcelamentoPanel({ map = null, planoId, alFeature, onPreview, onMaterialize }) {
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
    });

    const [metrics, setMetrics] = useState(null);
    const [versaoId, setVersaoId] = useState(null);

    // estados de carregamento
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [isMaterializing, setIsMaterializing] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // Mapbox-Draw opcional
    const drawRef = useRef(null);

    useEffect(() => {
        if (!map || drawRef.current) return;
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
    }, [map]);

    // Helpers Mapbox
    const upsertSource = (id, data) => {
        if (!map) return;
        const src = map.getSource(id);
        if (src) src.setData(data);
        else map.addSource(id, { type: "geojson", data });
    };

    const ensureLayers = () => {
        if (!map) return;
        if (!map.getLayer(LYR_VIAS)) {
            map.addLayer({ id: LYR_VIAS, type: "line", source: SRC_VIAS, paint: { "line-width": 3 } });
        }
        if (!map.getLayer(LYR_QUART)) {
            map.addLayer({ id: LYR_QUART, type: "fill", source: SRC_QUART, paint: { "fill-opacity": 0.25 } });
        }
        if (!map.getLayer(LYR_LOTES)) {
            map.addLayer({ id: LYR_LOTES, type: "line", source: SRC_LOTES, paint: { "line-width": 1 } });
        }
    };

    const loadPreview = async () => {
        if (!planoId) {
            alert("Selecione um projeto para criar/obter um Plano de Parcelamento.");
            return;
        }
        if (!alFeature?.geometry) {
            alert("Área Loteável/AOI não encontrada.");
            return;
        }

        const alGeom = alFeature.geometry;
        setIsPreviewing(true);
        try {
            const data = await previewParcelamento(planoId, { alGeom, params });
            setMetrics(data?.metrics || null);

            if (map) {
                upsertSource(SRC_VIAS, data.vias);
                upsertSource(SRC_QUART, data.quarteiroes);
                upsertSource(SRC_LOTES, data.lotes);
                ensureLayers();
                if (drawRef.current) {
                    try {
                        drawRef.current.deleteAll();
                        (data?.vias?.features || []).forEach((f) => drawRef.current.add(f));
                    } catch { }
                }
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
        if (!planoId) {
            alert("Plano de Parcelamento não definido.");
            return;
        }
        if (!alFeature?.geometry) {
            alert("Área Loteável/AOI não encontrada.");
            return;
        }

        const alGeom = alFeature.geometry;

        let userEdits = {};
        if (drawRef.current) {
            try {
                const edited = drawRef.current.getAll();
                if (edited?.features?.length) userEdits.vias = edited;
            } catch { }
        }

        setIsMaterializing(true);
        try {
            const res = await materializarParcelamento(planoId, {
                alGeom,
                params,
                userEdits,
                isOficial: true,
                nota: "",
            });

            const vId = res?.versao_id;
            if (!vId) {
                alert("Materialização não retornou versao_id.");
                return;
            }

            setVersaoId(vId);
            onMaterialize?.(vId);

            if (map) {
                const gj = await getVersaoGeojson(vId);
                upsertSource(SRC_VIAS, gj.vias);
                upsertSource(SRC_QUART, gj.quarteiroes);
                upsertSource(SRC_LOTES, gj.lotes);
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
        if (!versaoId) {
            alert("Materialize primeiro para gerar KML.");
            return;
        }
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

    // rótulos com carregando
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
                        onChange={(e) => setParams((p) => ({ ...p, frente_min_m: parseFloat(e.target.value) }))}
                    />
                </label>

                <label>Profundidade mínima (m)
                    <input
                        type="number"
                        className="input"
                        value={params.prof_min_m}
                        onChange={(e) => setParams((p) => ({ ...p, prof_min_m: parseFloat(e.target.value) }))}
                    />
                </label>

                <label>Larg. rua vertical (m)
                    <input
                        type="number"
                        className="input"
                        value={params.larg_rua_vert_m}
                        onChange={(e) => setParams((p) => ({ ...p, larg_rua_vert_m: parseFloat(e.target.value) }))}
                    />
                </label>

                <label>Larg. rua horizontal (m)
                    <input
                        type="number"
                        className="input"
                        value={params.larg_rua_horiz_m}
                        onChange={(e) => setParams((p) => ({ ...p, larg_rua_horiz_m: parseFloat(e.target.value) }))}
                    />
                </label>

                <label>Comp. máx quarteirão (m)
                    <input
                        type="number"
                        className="input"
                        value={params.compr_max_quarteirao_m}
                        onChange={(e) => setParams((p) => ({ ...p, compr_max_quarteirao_m: parseFloat(e.target.value) }))}
                    />
                </label>

                <label>Orientação (°) (opcional)
                    <input
                        type="number"
                        className="input"
                        value={params.orientacao_graus ?? ""}
                        onChange={(e) => {
                            const val = e.target.value === "" ? null : parseFloat(e.target.value);
                            setParams((p) => ({ ...p, orientacao_graus: val }));
                        }}
                    />
                </label>
            </div>

            <div className="flex gap-2">
                <button
                    className="btn"
                    onClick={loadPreview}
                    disabled={isPreviewing || isMaterializing || !planoId}
                    title={!planoId ? "Selecione um projeto para obter o plano" : ""}
                >
                    {labelPreview}
                </button>

                <button
                    className="btn"
                    onClick={handleMaterializar}
                    disabled={isMaterializing || isPreviewing || !planoId}
                    title={!planoId ? "Selecione um projeto para obter o plano" : ""}
                >
                    {labelMaterial}
                </button>

                <button
                    className="btn"
                    onClick={handleExportKML}
                    disabled={isExporting || !versaoId}
                    title={!versaoId ? "Materialize primeiro" : ""}
                >
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

            {!map && (
                <p className="text-xs opacity-70">
                    Dica: edição na prévia (arrastar vias) exige um mapa Mapbox. No RestricoesViewer (Leaflet) a prévia é só visual.
                </p>
            )}
        </div>
    );
}
