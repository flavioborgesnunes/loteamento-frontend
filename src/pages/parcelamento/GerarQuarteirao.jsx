// src/pages/parcelamento/GerarQuarteirao.jsx
import React, { useEffect, useRef, useState } from "react";
import useAxios from "../../utils/useAxios";

import "ol/ol.css";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import XYZ from "ol/source/XYZ";
import VectorSource from "ol/source/Vector";
import { Fill, Stroke, Style, Circle as CircleStyle, Text } from "ol/style";
import { Point as OLPoint } from "ol/geom";
import GeoJSON from "ol/format/GeoJSON";
import { fromLonLat } from "ol/proj";
import { Draw, Modify, Select, Snap, Translate } from "ol/interaction";
import { click as clickSelectCondition, shiftKeyOnly, altKeyOnly } from "ol/events/condition";
import { defaults as defaultControls, ScaleLine, FullScreen, MousePosition, Zoom, Rotate, Attribution } from "ol/control";
import { createStringXY } from "ol/coordinate";

const gj = new GeoJSON();
const token = import.meta.env.VITE_MAPBOX_TOKEN?.trim();
const hidpi = typeof window !== "undefined" && window.devicePixelRatio > 1;

// ---- estilos ----
const styleAoi = new Style({ stroke: new Stroke({ color: "#2c7be5", width: 2 }), fill: new Fill({ color: "rgba(44,123,229,0.05)" }) });
const styleLoteavel = new Style({ stroke: new Stroke({ color: "#FFB300", width: 2 }), fill: new Fill({ color: "rgba(255,213,79,0.22)" }) });

const styleViasArea = new Style({
    stroke: new Stroke({ color: "#9ca3af", width: 1 }),
    fill: new Fill({ color: "rgba(156,163,175,0.8)" }),
});
const styleViasLineWhite = new Style({ stroke: new Stroke({ color: "#ffffff", width: 2 }) });
const styleQuartBorda = new Style({ stroke: new Stroke({ color: "#0ea5e9", width: 2 }), fill: null });
const styleCalcada = new Style({ stroke: new Stroke({ color: "#e5e7eb", width: 1 }), fill: new Fill({ color: "rgba(255,255,255,1)" }) });

function makeLoteStyle({ strokeColor, fillColor, textColor = "#111", haloColor = "rgba(255,255,255,0.95)" }) {
    const cache = new WeakMap();
    return (feature, resolution) => {
        const cached = cache.get(feature);
        if (cached && cached.__res === resolution) return cached.styles;

        const styles = [];
        styles.push(
            new Style({
                stroke: new Stroke({ color: strokeColor, width: 1.5 }),
                fill: new Fill({ color: fillColor }),
            })
        );

        const props = feature.getProperties?.() || {};
        const lotNumber = props.lot_number ?? props.lotNumber ?? props.id;
        const areaM2 = props.area_m2;
        const centerLonLat = props.label_center;
        const cornerLonLat = props.label_corner;

        const areaLabel = Number.isFinite(areaM2)
            ? areaM2 >= 1e4
                ? `${(areaM2 / 1e4).toFixed(2)} ha`
                : `${Math.round(areaM2).toLocaleString("pt-BR")} m²`
            : "";

        if (centerLonLat && centerLonLat.length === 2 && areaLabel) {
            const center3857 = fromLonLat(centerLonLat);
            styles.push(
                new Style({
                    geometry: new OLPoint(center3857),
                    text: new Text({
                        text: areaLabel,
                        font: "12px Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
                        fill: new Fill({ color: textColor }),
                        stroke: new Stroke({ color: haloColor, width: 3 }),
                        overflow: true,
                        offsetY: 0,
                    }),
                })
            );
        }

        if (cornerLonLat && cornerLonLat.length === 2 && lotNumber != null) {
            const corner3857 = fromLonLat(cornerLonLat);
            styles.push(
                new Style({
                    geometry: new OLPoint(corner3857),
                    text: new Text({
                        text: `#${lotNumber}`,
                        font: "bold 12px Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
                        fill: new Fill({ color: textColor }),
                        stroke: new Stroke({ color: haloColor, width: 3 }),
                        overflow: true,
                        offsetX: 8,
                        offsetY: -8,
                    }),
                })
            );
        }

        cache.set(feature, { __res: resolution, styles });
        return styles;
    };
}

const styleLoteFill = makeLoteStyle({
    strokeColor: "#f59e0b",
    fillColor: "rgba(255, 213, 79, 0.35)",
    textColor: "#0b132b",
    haloColor: "rgba(255,255,255,0.95)",
});

// ---- helpers ----
function toFC(x) {
    if (!x) return { type: "FeatureCollection", features: [] };
    if (x.type === "FeatureCollection") return x;
    if (x.type === "Feature") return { type: "FeatureCollection", features: [x] };
    return { type: "FeatureCollection", features: [] };
}
function setLayerData(vectorLayer, dataFC, style) {
    if (!vectorLayer) return;
    const src = vectorLayer.getSource();
    src.clear(true);
    if (dataFC) {
        const fc = toFC(dataFC);
        if (fc.features?.length) {
            const feats = gj.readFeatures(fc, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" });
            src.addFeatures(feats);
        }
    }
    if (style) vectorLayer.setStyle(style);
}
function writeLayerAsFC(layer) {
    if (!layer) return { type: "FeatureCollection", features: [] };
    const feats = layer.getSource()?.getFeatures?.() || [];
    if (!feats.length) return { type: "FeatureCollection", features: [] };
    const fc = gj.writeFeaturesObject(feats, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" });
    return toFC(fc);
}

export default function GerarQuarteirao() {
    const axiosAuth = useAxios();

    const mapRef = useRef(null);
    const containerRef = useRef(null);

    const baseLayersRef = useRef({});
    const layersRef = useRef({
        aoi: null,
        loteavel: null,
        guia: null,

        // prévia retornada pelo backend
        prev_vias_area: null,
        prev_vias_line: null,
        prev_quarteiroes: null,
        prev_lotes: null,
        calcadas: null,
    });

    const selectRef = useRef(null);
    const modifyRef = useRef(null);
    const translateRef = useRef(null);
    const snapRefs = useRef([]);
    const drawGuideRef = useRef(null);

    const [projetos, setProjetos] = useState([]);
    const [projetoSel, setProjetoSel] = useState("");
    const [versoes, setVersoes] = useState([]);
    const [restricaoSel, setRestricaoSel] = useState("");
    const [geo, setGeo] = useState(null);

    const [planoId, setPlanoId] = useState(null);
    const [isPreviewing, setIsPreviewing] = useState(false);

    const [params, setParams] = useState({
        frente_min_m: 10,
        prof_min_m: 25,
        larg_rua_vert_m: 12,
        larg_rua_horiz_m: 12,
        compr_max_quarteirao_m: 200,
        calcada_largura_m: 2.5,
        orientacao_graus: null,
        srid_calc: 3857,
    });

    // ===== INIT MAP =====
    useEffect(() => {
        if (mapRef.current) return;

        const mkMapboxStyle = (styleId) =>
            new XYZ({
                url: `https://api.mapbox.com/styles/v1/mapbox/${styleId}/tiles/512/{z}/{x}/{y}${hidpi ? "@2x" : ""}?access_token=${token}`,
                tileSize: 512,
                maxZoom: 22,
            });

        const bases = {};
        if (token) {
            bases["mapbox-hibrido"] = new TileLayer({ visible: true, zIndex: 0, source: mkMapboxStyle("satellite-streets-v12") });
            bases["mapbox-ruas"] = new TileLayer({ visible: false, zIndex: 0, source: mkMapboxStyle("streets-v12") });
            bases["mapbox-sat"] = new TileLayer({ visible: false, zIndex: 0, source: mkMapboxStyle("satellite-v9") });
        }
        bases["esri"] = new TileLayer({
            visible: !token,
            zIndex: 0,
            source: new XYZ({ url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" }),
        });
        bases["osm"] = new TileLayer({ visible: false, zIndex: 0, source: new XYZ({ url: "https://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png" }) });
        baseLayersRef.current = bases;

        const mkVec = (z, style) => new VectorLayer({ zIndex: z, source: new VectorSource(), style });

        const L = layersRef.current;
        L.aoi = mkVec(520, styleAoi);
        L.loteavel = mkVec(597, styleLoteavel);
        L.guia = new VectorLayer({ zIndex: 606, source: new VectorSource(), style: new Style({ stroke: new Stroke({ color: "#f59e0b", width: 2 }) }) });

        L.prev_vias_area = mkVec(609, styleViasArea);
        L.prev_vias_line = mkVec(610, styleViasLineWhite);
        L.prev_quarteiroes = mkVec(611, styleQuartBorda);
        L.prev_lotes = new VectorLayer({ zIndex: 612, source: new VectorSource(), style: styleLoteFill, declutter: true, renderBuffer: 100 });
        L.calcadas = mkVec(621, styleCalcada);

        mapRef.current = new Map({
            target: containerRef.current,
            layers: [...Object.values(bases), ...Object.values(L)],
            view: new View({ center: fromLonLat([-55, -14]), zoom: 4, maxZoom: 22 }),
            controls: defaultControls({ attribution: true }).extend([
                new Zoom(),
                new Rotate(),
                new FullScreen(),
                new ScaleLine(),
                new MousePosition({ coordinateFormat: createStringXY(5), projection: "EPSG:4326", className: "mousepos bg-white/80 px-2 py-1 rounded text-xs" }),
                new Attribution(),
            ]),
        });

        // Interações básicas p/ editar guia e feições de preview
        const selectable = new Select({
            condition: clickSelectCondition,
            hitTolerance: 12,
            multi: false,
            layers: (lyr) => [L.guia, L.prev_quarteiroes, L.prev_lotes].includes(lyr),
            style: null,
        });
        mapRef.current.addInteraction(selectable);
        selectRef.current = selectable;

        const modify = new Modify({
            features: selectable.getFeatures(),
            pixelTolerance: 10,
            style: new Style({
                image: new CircleStyle({ radius: 6, fill: new Fill({ color: "#fff" }), stroke: new Stroke({ color: "#0ea5e9", width: 2 }) }),
                stroke: new Stroke({ color: "#0ea5e9", width: 2 }),
            }),
            deleteCondition: (e) => shiftKeyOnly(e),
            insertVertexCondition: (e) => altKeyOnly(e),
        });
        mapRef.current.addInteraction(modify);
        modifyRef.current = modify;

        const translate = new Translate({ features: selectable.getFeatures(), condition: shiftKeyOnly });
        mapRef.current.addInteraction(translate);
        translateRef.current = translate;

        [L.guia, L.prev_vias_area, L.prev_vias_line, L.prev_quarteiroes, L.prev_lotes].forEach((lyr) => {
            const s = new Snap({ source: lyr.getSource() });
            mapRef.current.addInteraction(s);
            snapRefs.current.push(s);
        });

        // Delete selecionado (Backspace/Delete)
        const onKeyDownDelete = (ev) => {
            if (ev.key !== "Delete" && ev.key !== "Backspace") return;
            const sel = selectRef.current?.getFeatures?.();
            if (!sel || sel.getLength() === 0) return;
            sel.forEach((f) => {
                Object.values(layersRef.current).forEach((lyr) => {
                    if (lyr?.getSource?.()?.hasFeature?.(f)) {
                        lyr.getSource().removeFeature(f);
                    }
                });
            });
            sel.clear();
        };
        window.addEventListener("keydown", onKeyDownDelete);

        return () => {
            window.removeEventListener("keydown", onKeyDownDelete);
            mapRef.current?.setTarget(null);
            mapRef.current = null;
        };
    }, []);

    // ===== FETCH LISTAS =====
    useEffect(() => {
        (async () => {
            try {
                const { data } = await axiosAuth.get("projetos/");
                setProjetos(data || []);
            } catch (e) {
                console.error("[fetch projetos] erro:", e?.message || e);
                alert("Erro ao carregar projetos (faça login).");
            }
        })();
    }, []);

    useEffect(() => {
        setVersoes([]);
        setRestricaoSel("");
        setGeo(null);
        setPlanoId(null);
        if (!projetoSel) return;
        (async () => {
            try {
                const { data } = await axiosAuth.get(`/projetos/${projetoSel}/restricoes/list/`);
                setVersoes(data || []);
            } catch (e) {
                console.error("[listar versões] erro:", e?.message || e);
                alert("Erro ao listar versões.");
            }
            try {
                // cria/obtém plano de parcelamento para o projeto (endpoint existente)
                const { data: planos } = await axiosAuth.get(`/parcelamento/planos/?project=${projetoSel}`);
                if (Array.isArray(planos) && planos.length) setPlanoId(planos[0].id);
                else {
                    // cria um plano padrão
                    const { data: novo } = await axiosAuth.post(`/parcelamento/planos/`, {
                        project: Number(projetoSel),
                        nome: "Plano padrão",
                    });
                    setPlanoId(novo?.id || null);
                }
            } catch (e) {
                console.error("[parcelamento] plano erro:", e?.message || e);
            }
        })();
    }, [projetoSel]);

    useEffect(() => {
        setGeo(null);
        if (!restricaoSel) return;
        const ac = new AbortController();
        (async () => {
            try {
                const { data } = await axiosAuth.get(`/restricoes/${restricaoSel}/geo/`, { signal: ac.signal });
                setGeo(data);
            } catch (e) {
                if (e?.name === "CanceledError" || e?.message === "canceled") return;
                console.error("[abrir versão] erro:", e?.message || e);
                alert("Não foi possível abrir a versão.");
            }
        })();
        return () => ac.abort();
    }, [restricaoSel]);

    // ===== REFLETIR AL/AOI NO MAPA =====
    useEffect(() => {
        const L = layersRef.current;
        if (!mapRef.current) return;

        const al =
            (geo?.area_loteavel?.features?.length && geo?.area_loteavel?.features?.[0]) ||
            (geo?.aoi && { type: "Feature", geometry: geo?.aoi, properties: {} }) ||
            null;
        setLayerData(L.aoi, al ? { type: "FeatureCollection", features: [al] } : null, styleAoi);
        setLayerData(L.loteavel, geo?.area_loteavel || null, styleLoteavel);

        // fit básico
        const srcs = [L.loteavel?.getSource?.(), L.aoi?.getSource?.()].filter(Boolean);
        let extent = null;
        srcs.forEach((s) => {
            const e = s.getExtent?.();
            if (!e || !isFinite(e[0])) return;
            if (!extent) extent = e.slice();
            else {
                extent[0] = Math.min(extent[0], e[0]);
                extent[1] = Math.min(extent[1], e[1]);
                extent[2] = Math.max(extent[2], e[2]);
                extent[3] = Math.max(extent[3], e[3]);
            }
        });
        if (extent) {
            try {
                mapRef.current.getView().fit(extent, { padding: [30, 30, 30, 30], maxZoom: 19, duration: 250 });
            } catch { }
        }
    }, [geo]);

    // ===== AÇÕES =====
    const desenharGuia = () => {
        if (!mapRef.current) return;
        const L = layersRef.current;

        // limpa guias antigas (opcional)
        L.guia.getSource().clear(true);

        if (drawGuideRef.current) {
            mapRef.current.removeInteraction(drawGuideRef.current);
            drawGuideRef.current = null;
        }
        const draw = new Draw({
            source: L.guia.getSource(),
            type: "LineString",
            style: new Style({
                stroke: new Stroke({ color: "#f59e0b", width: 2 }),
                image: new CircleStyle({ radius: 4, fill: new Fill({ color: "#f59e0b" }) }),
            }),
        });
        draw.on("drawend", () => {
            if (drawGuideRef.current) {
                mapRef.current.removeInteraction(drawGuideRef.current);
                drawGuideRef.current = null;
            }
        });
        drawGuideRef.current = draw;
        mapRef.current.addInteraction(draw);
    };

    const gerarQuarteirao = async () => {
        if (!planoId) {
            alert("Plano não definido.");
            return;
        }

        // pega AL (preferir area_loteavel; fallback aoi)
        const alFeat = geo?.area_loteavel?.features?.[0] || (geo?.aoi && { type: "Feature", geometry: geo?.aoi, properties: {} });
        if (!alFeat?.geometry) {
            alert("Área Loteável/AOI não encontrada.");
            return;
        }

        // coletar a LINHA-GUIA (uma única)
        const guiaFC = writeLayerAsFC(layersRef.current.guia);
        const guideLine = (guiaFC.features || []).find((f) => f?.geometry?.type === "LineString");
        if (!guideLine) {
            alert("Desenhe a linha-guia primeiro.");
            return;
        }

        const mergedParams = {
            ...params,
            // habilita lógica da guia no backend
            guia_linha_fc: { type: "FeatureCollection", features: [guideLine] },
        };

        setIsPreviewing(true);
        try {
            const { data } = await axiosAuth.post(`/parcelamento/planos/${planoId}/preview/`, {
                // ⚠️ IMPORTANTE: snake_case
                al_geom: alFeat.geometry,
                params: mergedParams,
            });

            // refletir no mapa
            setLayerData(layersRef.current.prev_vias_area, toFC(data?.vias_area), styleViasArea);
            setLayerData(layersRef.current.prev_vias_line, toFC(data?.vias), styleViasLineWhite);
            setLayerData(layersRef.current.prev_quarteiroes, toFC(data?.quarteiroes), styleQuartBorda);
            setLayerData(layersRef.current.prev_lotes, toFC(data?.lotes), styleLoteFill);
            setLayerData(layersRef.current.calcadas, toFC(data?.calcadas), styleCalcada);
        } catch (e) {
            console.error("[gerarQuarteirao] erro:", e?.response?.data || e?.message || e);
            alert("Erro ao gerar quarteirão. Veja o console.");
        } finally {
            setIsPreviewing(false);
        }
    };

    // ===== UI =====
    const [baseSel, setBaseSel] = useState(token ? "mapbox-hibrido" : "esri");
    useEffect(() => {
        const bases = baseLayersRef.current;
        Object.entries(bases).forEach(([k, lyr]) => lyr.setVisible(k === baseSel));
    }, [baseSel]);

    return (
        <div className="w-full h-full relative">
            {/* Topo: selects + base + ações */}
            <div className="absolute z-[1000] top-2 left-1/2 -translate-x-1/2 bg-white/85 backdrop-blur rounded-xl shadow p-3 flex flex-wrap gap-2 items-center">
                <select className="border p-2 rounded min-w-[260px]" value={projetoSel || ""} onChange={(e) => setProjetoSel(Number(e.target.value) || "")}>
                    <option value="">Selecione um projeto…</option>
                    {projetos.map((p) => (
                        <option key={p.id} value={p.id}>
                            {p.name || `Projeto #${p.id}`}
                        </option>
                    ))}
                </select>

                <select className="border p-2 rounded min-w-[260px]" value={restricaoSel || ""} onChange={(e) => setRestricaoSel(Number(e.target.value) || "")} disabled={!versoes.length}>
                    <option value="">{versoes.length ? "Selecione uma versão de restrições…" : "Sem versões"}</option>
                    {versoes.map((v) => (
                        <option key={v.id} value={v.id}>
                            v{v.version} {v.label ? `— ${v.label}` : ""} {v.is_active ? "(ativa)" : ""}
                        </option>
                    ))}
                </select>

                <select className="border p-2 rounded" value={baseSel} onChange={(e) => setBaseSel(e.target.value)} title="Mapa base">
                    {token && <option value="mapbox-hibrido">Mapbox Híbrido</option>}
                    {token && <option value="mapbox-ruas">Mapbox Ruas</option>}
                    {token && <option value="mapbox-sat">Mapbox Satélite</option>}
                    <option value="esri">Esri World Imagery</option>
                    <option value="osm">OSM (Ruas)</option>
                </select>

                <div className="flex gap-2 ml-2">
                    <button className="border px-2 py-1 rounded bg-amber-100 hover:bg-amber-200" onClick={desenharGuia} title="Desenhar uma linha-guia">
                        ➕ Desenhar guia
                    </button>
                    <button className="border px-3 py-1 rounded bg-white hover:bg-slate-100" onClick={gerarQuarteirao} disabled={isPreviewing || !planoId}>
                        {isPreviewing ? "⏳ Gerando…" : "Gerar QUARTEIRÃO pela guia"}
                    </button>
                </div>

                {/* Parâmetros essenciais */}
                <div className="flex gap-2 ml-2">
                    <label className="text-xs">
                        Frente (m)
                        <input
                            type="number"
                            className="border rounded p-1 ml-1 w-20"
                            value={params.frente_min_m}
                            onChange={(e) => setParams((p) => ({ ...p, frente_min_m: parseFloat(e.target.value) }))}
                        />
                    </label>
                    <label className="text-xs">
                        Prof. (m)
                        <input
                            type="number"
                            className="border rounded p-1 ml-1 w-20"
                            value={params.prof_min_m}
                            onChange={(e) => setParams((p) => ({ ...p, prof_min_m: parseFloat(e.target.value) }))}
                        />
                    </label>
                    <label className="text-xs">
                        Rua (m)
                        <input
                            type="number"
                            className="border rounded p-1 ml-1 w-20"
                            value={params.larg_rua_vert_m}
                            onChange={(e) => setParams((p) => ({ ...p, larg_rua_vert_m: parseFloat(e.target.value) }))}
                        />
                    </label>
                    <label className="text-xs">
                        Calçada (m)
                        <input
                            type="number"
                            className="border rounded p-1 ml-1 w-20"
                            step="0.1"
                            min="0"
                            value={params.calcada_largura_m}
                            onChange={(e) => setParams((p) => ({ ...p, calcada_largura_m: parseFloat(e.target.value) }))}
                        />
                    </label>
                    <label className="text-xs">
                        Comp. máx Q (m)
                        <input
                            type="number"
                            className="border rounded p-1 ml-1 w-24"
                            value={params.compr_max_quarteirao_m}
                            onChange={(e) => setParams((p) => ({ ...p, compr_max_quarteirao_m: parseFloat(e.target.value) }))}
                        />
                    </label>
                </div>
            </div>

            {/* Mapa */}
            <div ref={containerRef} style={{ height: "100vh", width: "100%" }} />
        </div>
    );
}
