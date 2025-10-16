import React, { useEffect, useMemo, useRef, useState } from "react";
import useAxios from "../../utils/useAxios";
import ParcelamentoPanel from "../parcelamento/ParcelamentoPanel";
import useParcelamentoApi from "../parcelamento/parcelamento";

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
import Overlay from "ol/Overlay";
import { Modify, Snap, Select, Draw } from "ol/interaction";
import Translate from "ol/interaction/Translate";
import { click as clickSelectCondition, shiftKeyOnly, altKeyOnly } from "ol/events/condition";
import { defaults as defaultControls, ScaleLine, FullScreen, MousePosition, Zoom, Rotate, Attribution } from "ol/control";
import { createStringXY } from "ol/coordinate";
import { getLength as sphereLength, getArea as sphereArea } from "ol/sphere";
import { unByKey } from "ol/Observable";

// ---------------- Helpers
const gj = new GeoJSON();
const token = import.meta.env.VITE_MAPBOX_TOKEN?.trim();
const hidpi = typeof window !== "undefined" && window.devicePixelRatio > 1;

function toFC(x) {
    if (!x) return { type: "FeatureCollection", features: [] };
    if (x.type === "FeatureCollection") return x;
    if (x.type === "Feature") return { type: "FeatureCollection", features: [x] };
    return { type: "FeatureCollection", features: [] };
}
function buildFCsForFit(geo) {
    if (!geo) return { fcAOI: null, all: null };
    const aoiGeom = geo?.aoi || geo?.aoi_snapshot || null;
    const fcAOI = aoiGeom ? toFC({ type: "Feature", geometry: aoiGeom, properties: {} }) : null;
    const fcs = [
        toFC(geo?.av), toFC(geo?.corte_av),
        toFC(geo?.ruas_eixo), toFC(geo?.ruas_mask),
        toFC(geo?.rios_centerline), toFC(geo?.rios_faixa),
        toFC(geo?.lt_centerline), toFC(geo?.lt_faixa),
        toFC(geo?.ferrovias_centerline), toFC(geo?.ferrovias_faixa),
    ];
    const all = { type: "FeatureCollection", features: [] };
    fcs.forEach(fc => { if (fc?.features?.length) all.features.push(...fc.features); });
    return { fcAOI, all: (all.features.length ? all : null) };
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
function extentFromLayers(layers) {
    let extent = null;
    layers.forEach((lyr) => {
        const src = lyr?.getSource?.();
        if (!src) return;
        const e = src.getExtent?.();
        if (!e || !isFinite(e[0])) return;
        if (!extent) extent = e.slice();
        else {
            extent[0] = Math.min(extent[0], e[0]);
            extent[1] = Math.min(extent[1], e[1]);
            extent[2] = Math.max(extent[2], e[2]);
            extent[3] = Math.max(extent[3], e[3]);
        }
    });
    return extent;
}

// ---------------- Estilos
const styleAoi = new Style({ stroke: new Stroke({ color: "#2c7be5", width: 2 }), fill: new Fill({ color: "rgba(44,123,229,0.05)" }) });
const styleAV = new Style({ stroke: new Stroke({ color: "#007a4d", width: 2 }), fill: new Fill({ color: "rgba(65,214,134,0.45)" }) });
const styleCorte = new Style({ stroke: new Stroke({ color: "#e11d48", width: 2 }), fill: new Fill({ color: "rgba(252,165,165,0.35)" }) });
const styleRuaEixo = new Style({ stroke: new Stroke({ color: "#333", width: 3 }) });
const styleRuaMask = new Style({ stroke: new Stroke({ color: "#333", width: 1 }), fill: new Fill({ color: "rgba(51,51,51,0.25)" }) });
const styleRiosCL = new Style({ stroke: new Stroke({ color: "#2E86AB", width: 2 }) });
const styleRiosFx = new Style({ stroke: new Stroke({ color: "#2E86AB", width: 2 }), fill: new Fill({ color: "rgba(46,134,171,0.25)" }) });
const styleLTCL = new Style({ stroke: new Stroke({ color: "#A84300", width: 2 }) });
const styleLTFx = new Style({ stroke: new Stroke({ color: "#A84300", width: 2 }), fill: new Fill({ color: "rgba(168,67,0,0.25)" }) });
const styleFerCL = new Style({ stroke: new Stroke({ color: "#6D4C41", width: 2 }) });
const styleFerFx = new Style({ stroke: new Stroke({ color: "#6D4C41", width: 2 }), fill: new Fill({ color: "rgba(109,76,65,0.25)" }) });
const styleLoteavel = new Style({ stroke: new Stroke({ color: "#FFB300", width: 2 }), fill: new Fill({ color: "rgba(255,213,79,0.22)" }) });

const styleViaPreview = new Style({ stroke: new Stroke({ color: "#0ea5e9", width: 3 }) });
const styleQuartPreview = new Style({ stroke: new Stroke({ color: "#0ea5e9", width: 2 }), fill: new Fill({ color: "rgba(14,165,233,0.10)" }) });

function makeLoteStyle({ strokeColor, fillColor, textColor = "#111", haloColor = "rgba(255,255,255,0.9)" }) {
    const cache = new WeakMap();
    return (feature, resolution) => {
        const cached = cache.get(feature);
        if (cached && cached.__res === resolution) return cached.styles;

        const styles = [];
        styles.push(new Style({ stroke: new Stroke({ color: strokeColor, width: 1 }), fill: new Fill({ color: fillColor }) }));

        const props = feature.getProperties?.() || {};
        const lotNumber = props.lot_number;
        const areaM2 = props.area_m2;
        const centerLonLat = props.label_center;
        const cornerLonLat = props.label_corner;

        const areaLabel = Number.isFinite(areaM2)
            ? (areaM2 >= 1e4 ? `${(areaM2 / 1e4).toFixed(2)} ha` : `${Math.round(areaM2).toLocaleString("pt-BR")} m²`)
            : "";

        if (centerLonLat && centerLonLat.length === 2 && areaLabel) {
            const center3857 = fromLonLat(centerLonLat);
            styles.push(new Style({
                geometry: new OLPoint(center3857),
                text: new Text({
                    text: areaLabel,
                    font: "12px Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
                    fill: new Fill({ color: textColor }),
                    stroke: new Stroke({ color: haloColor, width: 3 }),
                    overflow: true,
                    offsetY: 0,
                }),
            }));
        }

        if (cornerLonLat && cornerLonLat.length === 2 && Number.isFinite(lotNumber)) {
            const corner3857 = fromLonLat(cornerLonLat);
            styles.push(new Style({
                geometry: new OLPoint(corner3857),
                text: new Text({
                    text: `#${lotNumber}`,
                    font: "bold 12px Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
                    fill: new Fill({ color: textColor }),
                    stroke: new Stroke({ color: haloColor, width: 3 }),
                    overflow: true,
                    offsetX: 8, offsetY: -8,
                }),
            }));
        }

        cache.set(feature, { __res: resolution, styles });
        return styles;
    };
}

const styleLotePreview = makeLoteStyle({
    strokeColor: "#0ea5e9",
    fillColor: "rgba(14,165,233,0.14)",
    textColor: "#0b132b",
    haloColor: "rgba(255,255,255,0.95)",
});
const styleViaOficial = new Style({ stroke: new Stroke({ color: "#7c3aed", width: 3 }) });
const styleQuartOficial = new Style({ stroke: new Stroke({ color: "#7c3aed", width: 2 }), fill: new Fill({ color: "rgba(124,58,237,0.10)" }) });
const styleLoteOficial = makeLoteStyle({
    strokeColor: "#7c3aed",
    fillColor: "rgba(124,58,237,0.14)",
    textColor: "#1f2937",
    haloColor: "rgba(255,255,255,0.95)",
});

// FC writer para a camada GUIA
function writeLayerAsFC(layer) {
    if (!layer) return { type: "FeatureCollection", features: [] };
    const feats = layer.getSource()?.getFeatures?.() || [];
    if (!feats.length) return { type: "FeatureCollection", features: [] };
    const fc = gj.writeFeaturesObject(feats, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" });
    return toFC(fc);
}

export default function RestricoesViewerOL() {
    const axiosAuth = useAxios();
    const { getOrCreatePlanoForProject, getVersaoGeojson } = useParcelamentoApi();

    const mapRef = useRef(null);
    const containerRef = useRef(null);

    const baseLayersRef = useRef({});
    const layersRef = useRef({
        aoi: null, loteavel: null, av: null, corte: null,
        ruas_eixo: null, ruas_mask: null,
        rios_centerline: null, rios_faixa: null,
        lt_centerline: null, lt_faixa: null,
        ferrovias_centerline: null, ferrovias_faixa: null,
        prev_vias: null, prev_quarteiroes: null, prev_lotes: null,
        ofc_vias: null, ofc_quarteiroes: null, ofc_lotes: null,
        guia: null, // <— linha-guia orientadora
    });

    const selectRef = useRef(null);
    const modifyRef = useRef(null);
    const translateRef = useRef(null);
    const snapRefs = useRef([]);
    const drawGuideRef = useRef(null); // <— Draw da linha-guia

    const [projetos, setProjetos] = useState([]);
    const [projetoSel, setProjetoSel] = useState("");
    const [versoes, setVersoes] = useState([]);
    const [restricaoSel, setRestricaoSel] = useState("");
    const [geo, setGeo] = useState(null);

    const [planoId, setPlanoId] = useState(null);
    const [parcelOficial, setParcelOficial] = useState({ vias: null, quarteiroes: null, lotes: null });

    const [editTarget, setEditTarget] = useState("none"); // none|aoi|av|corte|loteavel|rua_mask|guia
    const [measureMode, setMeasureMode] = useState("none"); // none|distance|area

    // ===== Medição helpers =====
    function formatLength(geom) {
        const len = sphereLength(geom, { projection: "EPSG:3857" });
        return len > 1000 ? `${(len / 1000).toFixed(2)} km` : `${len.toFixed(2)} m`;
    }
    function formatArea(geom) {
        const area = sphereArea(geom, { projection: "EPSG:3857" });
        if (area > 1e6) return `${(area / 1e6).toFixed(2)} km²`;
        if (area > 1e4) return `${(area / 1e4).toFixed(2)} ha`;
        return `${area.toFixed(2)} m²`;
    }

    // ---------------- Init Mapa ----------------
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
        L.av = mkVec(580, styleAV);
        L.corte = mkVec(585, styleCorte);
        L.ruas_eixo = mkVec(590, styleRuaEixo);
        L.ruas_mask = mkVec(590, styleRuaMask);
        L.rios_centerline = mkVec(595, styleRiosCL);
        L.rios_faixa = mkVec(595, styleRiosFx);
        L.lt_centerline = mkVec(596, styleLTCL);
        L.lt_faixa = mkVec(596, styleLTFx);
        L.ferrovias_centerline = mkVec(597, styleFerCL);
        L.ferrovias_faixa = mkVec(597, styleFerFx);

        L.prev_vias = mkVec(610, styleViaPreview);
        L.prev_quarteiroes = mkVec(611, styleQuartPreview);
        L.prev_lotes = new VectorLayer({
            zIndex: 612,
            source: new VectorSource(),
            style: styleLotePreview,
            declutter: true,
            renderBuffer: 100,
        });

        L.ofc_vias = mkVec(613, styleViaOficial);
        L.ofc_quarteiroes = mkVec(614, styleQuartOficial);
        L.ofc_lotes = new VectorLayer({
            zIndex: 615,
            source: new VectorSource(),
            style: styleLoteOficial,
            declutter: true,
            renderBuffer: 100,
        });

        // GUIA (editável/desenhável)
        L.guia = new VectorLayer({
            zIndex: 606,
            source: new VectorSource(),
            style: new Style({ stroke: new Stroke({ color: "#f59e0b", width: 2 }) }),
        });

        mapRef.current = new Map({
            target: containerRef.current,
            layers: [...Object.values(bases), ...Object.values(L)],
            view: new View({ center: fromLonLat([-55, -14]), zoom: 4, maxZoom: 22 }),
            controls: defaultControls({ attribution: true }).extend([
                new Zoom(), new Rotate(), new FullScreen(), new ScaleLine(),
                new MousePosition({ coordinateFormat: createStringXY(5), projection: "EPSG:4326", className: "mousepos bg-white/80 px-2 py-1 rounded text-xs" }),
                new Attribution(),
            ]),
        });

        // --- Interações recriáveis por modo ---
        const buildLayerFilter = (mode) => {
            const Lx = layersRef.current;
            const allowPreview = (lyr) => lyr === Lx.prev_vias || lyr === Lx.prev_quarteiroes || lyr === Lx.prev_lotes;
            if (mode === "none") return (lyr) => allowPreview(lyr) || lyr === Lx.guia;
            if (mode === "aoi") return (lyr) => allowPreview(lyr) || lyr === Lx.aoi || lyr === Lx.guia;
            if (mode === "av") return (lyr) => allowPreview(lyr) || lyr === Lx.av || lyr === Lx.guia;
            if (mode === "corte") return (lyr) => allowPreview(lyr) || lyr === Lx.corte || lyr === Lx.guia;
            if (mode === "loteavel") return (lyr) => allowPreview(lyr) || lyr === Lx.loteavel || lyr === Lx.guia;
            if (mode === "rua_mask") return (lyr) => allowPreview(lyr) || lyr === Lx.ruas_mask || lyr === Lx.guia;
            if (mode === "guia") return (lyr) => lyr === Lx.guia || allowPreview(lyr);
            return (lyr) => allowPreview(lyr) || lyr === Lx.guia;
        };

        const recreateInteractions = (mode) => {
            if (selectRef.current) mapRef.current.removeInteraction(selectRef.current);
            if (modifyRef.current) mapRef.current.removeInteraction(modifyRef.current);
            if (translateRef.current) mapRef.current.removeInteraction(translateRef.current);
            snapRefs.current.forEach((s) => mapRef.current.removeInteraction(s));
            snapRefs.current = [];

            // interrompe draw da guia se ativo
            if (drawGuideRef.current) {
                mapRef.current.removeInteraction(drawGuideRef.current);
                drawGuideRef.current = null;
            }

            selectRef.current = new Select({
                condition: clickSelectCondition,
                hitTolerance: 12,
                multi: true,
                layers: buildLayerFilter(mode),
                style: null,
            });
            mapRef.current.addInteraction(selectRef.current);

            modifyRef.current = new Modify({
                features: selectRef.current.getFeatures(),
                pixelTolerance: 10,
                style: new Style({
                    image: new CircleStyle({ radius: 6, fill: new Fill({ color: "#fff" }), stroke: new Stroke({ color: "#0ea5e9", width: 2 }) }),
                    stroke: new Stroke({ color: "#0ea5e9", width: 2 }),
                }),
                deleteCondition: (e) => shiftKeyOnly(e),
                insertVertexCondition: (e) => altKeyOnly(e),
            });
            mapRef.current.addInteraction(modifyRef.current);

            translateRef.current = new Translate({ features: selectRef.current.getFeatures(), condition: shiftKeyOnly });
            mapRef.current.addInteraction(translateRef.current);

            const Lx = layersRef.current;
            [
                Lx.prev_vias, Lx.prev_quarteiroes, Lx.prev_lotes, Lx.guia,
                Lx.aoi, Lx.av, Lx.corte, Lx.loteavel, Lx.ruas_mask,
                Lx.rios_centerline, Lx.rios_faixa, Lx.lt_centerline, Lx.lt_faixa,
                Lx.ferrovias_centerline, Lx.ferrovias_faixa,
            ].forEach((lyr) => {
                if (!lyr) return;
                const s = new Snap({ source: lyr.getSource() });
                mapRef.current.addInteraction(s);
                snapRefs.current.push(s);
            });
        };

        mapRef.current.__recreateInteractions = recreateInteractions;
        recreateInteractions("none");

        // Delete/Backspace remove feições selecionadas
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

    // alterna base
    const [baseSel, setBaseSel] = useState(token ? "mapbox-hibrido" : "esri");

    useEffect(() => {
        const bases = baseLayersRef.current;
        Object.entries(bases).forEach(([k, lyr]) => {
            lyr.setVisible(k === baseSel);
        });
    }, [baseSel]);


    // muda o modo de edição → recria interações
    useEffect(() => {
        mapRef.current?.__recreateInteractions?.(editTarget);
    }, [editTarget]);

    // carregar projetos
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

    // ao mudar projeto
    useEffect(() => {
        setVersoes([]); setRestricaoSel(""); setGeo(null); setPlanoId(null);
        setParcelOficial({ vias: null, quarteiroes: null, lotes: null });
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
                const plano = await getOrCreatePlanoForProject(projetoSel);
                setPlanoId(plano?.id || null);
            } catch (e) {
                console.error("[parcelamento] plano erro:", e?.message || e);
            }
        })();
    }, [projetoSel]);

    // abrir versão
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

    // aplicar camadas e fit
    useEffect(() => {
        const L = layersRef.current;
        if (!mapRef.current) return;

        setLayerData(L.aoi, (geo?.aoi || geo?.aoi_snapshot) && {
            type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: geo?.aoi || geo?.aoi_snapshot }],
        });
        setLayerData(L.av, toFC(geo?.av), styleAV);
        setLayerData(L.corte, toFC(geo?.corte_av), styleCorte);
        setLayerData(L.ruas_eixo, toFC(geo?.ruas_eixo), styleRuaEixo);
        setLayerData(L.ruas_mask, toFC(geo?.ruas_mask), styleRuaMask);
        setLayerData(L.rios_centerline, toFC(geo?.rios_centerline), styleRiosCL);
        setLayerData(L.rios_faixa, toFC(geo?.rios_faixa), styleRiosFx);
        setLayerData(L.lt_centerline, toFC(geo?.lt_centerline), styleLTCL);
        setLayerData(L.lt_faixa, toFC(geo?.lt_faixa), styleLTFx);
        setLayerData(L.ferrovias_centerline, toFC(geo?.ferrovias_centerline), styleFerCL);
        setLayerData(L.ferrovias_faixa, toFC(geo?.ferrovias_faixa), styleFerFx);
        setLayerData(L.loteavel, toFC(geo?.area_loteavel), styleLoteavel);

        const { fcAOI, all } = buildFCsForFit(geo);
        const tempAoi = new VectorLayer({ source: new VectorSource() });
        const tempAll = new VectorLayer({ source: new VectorSource() });
        setLayerData(tempAoi, fcAOI, null);
        setLayerData(tempAll, all, null);

        let ext = extentFromLayers([tempAoi]);
        if (!ext) ext = extentFromLayers([tempAll]);
        if (ext) {
            try {
                mapRef.current.getView().fit(ext, { padding: [30, 30, 30, 30], maxZoom: 19, duration: 250 });
                setTimeout(() => mapRef.current.getView().fit(ext, { padding: [30, 30, 30, 30], maxZoom: 19, duration: 0 }), 120);
            } catch { }
        }
    }, [geo]);

    // refletir oficiais
    useEffect(() => {
        const L = layersRef.current;
        setLayerData(L.ofc_vias, toFC(parcelOficial.vias), styleViaOficial);
        setLayerData(L.ofc_quarteiroes, toFC(parcelOficial.quarteiroes), styleQuartOficial);
        setLayerData(L.ofc_lotes, toFC(parcelOficial.lotes), styleLoteOficial);
    }, [parcelOficial]);

    // extraParams enviados ao painel (inclui GUIA)
    const extraParams = useMemo(() => {
        const L = layersRef.current;
        return {
            ruas_mask_fc: toFC(geo?.ruas_mask),
            ruas_eixo_fc: toFC(geo?.ruas_eixo),
            guia_linha_fc: writeLayerAsFC(L.guia),
            // dist_min_rua_quarteirao_m: 0  // se quiser sobrepor o default
        };
    }, [geo, layersRef.current.guia?.getSource()?.getRevision?.()]);

    // ------ desenhar linha-guia ------
    const startGuideDraw = () => {
        if (!mapRef.current) return;
        // encerra draw ativo
        if (drawGuideRef.current) {
            mapRef.current.removeInteraction(drawGuideRef.current);
            drawGuideRef.current = null;
        }
        const draw = new Draw({
            source: layersRef.current.guia.getSource(),
            type: "LineString",
            style: new Style({
                stroke: new Stroke({ color: "#f59e0b", width: 2 }),
                image: new CircleStyle({ radius: 4, fill: new Fill({ color: "#f59e0b" }) })
            }),
        });
        draw.on("drawend", () => {
            // finaliza o draw automaticamente ao concluir a primeira linha
            if (drawGuideRef.current) {
                mapRef.current.removeInteraction(drawGuideRef.current);
                drawGuideRef.current = null;
            }
            // mantém modo de edição “guia” para permitir ajustar a linha
            setEditTarget("guia");
            mapRef.current?.__recreateInteractions?.("guia");
        });
        drawGuideRef.current = draw;
        mapRef.current.addInteraction(draw);
        setEditTarget("guia");
    };

    return (
        <div className="w-full h-full relative">
            {/* Topo: selects + base + modos de edição + medição */}
            <div className="absolute z-[1000] top-2 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur rounded-xl shadow p-3 flex flex-wrap gap-2 items-center">
                <select className="border p-2 rounded min-w-[260px]" value={projetoSel || ""} onChange={(e) => setProjetoSel(Number(e.target.value) || "")}>
                    <option value="">Selecione um projeto…</option>
                    {projetos.map((p) => (<option key={p.id} value={p.id}>{p.name || `Projeto #${p.id}`}</option>))}
                </select>

                <select className="border p-2 rounded min-w-[260px]" value={restricaoSel || ""} onChange={(e) => setRestricaoSel(Number(e.target.value) || "")} disabled={!versoes.length}>
                    <option value="">{versoes.length ? "Selecione uma versão…" : "Sem versões"}</option>
                    {versoes.map((v) => (
                        <option key={v.id} value={v.id}>
                            v{v.version} {v.label ? `— ${v.label}` : ""} {v.is_active ? "(ativa)" : ""}
                        </option>
                    ))}
                </select>

                <select
                    className="border p-2 rounded"
                    value={baseSel}
                    onChange={(e) => setBaseSel(e.target.value)}
                    title="Mapa base"
                >
                    {token && <option value="mapbox-hibrido">Mapbox Híbrido</option>}
                    {token && <option value="mapbox-ruas">Mapbox Ruas</option>}
                    {token && <option value="mapbox-sat">Mapbox Satélite</option>}
                    <option value="esri">Esri World Imagery</option>
                    <option value="osm">OSM (Ruas)</option>
                </select>


                {/* Modo de edição */}
                <div className="flex gap-1 ml-2">
                    <span className="text-xs mr-1 opacity-70">Editar:</span>
                    <button className={`border px-2 py-1 rounded ${editTarget === "none" ? "bg-slate-800 text-white" : "bg-white"}`} onClick={() => setEditTarget("none")}>Prévia</button>
                    <button className={`border px-2 py-1 rounded ${editTarget === "aoi" ? "bg-slate-800 text-white" : "bg-white"}`} onClick={() => setEditTarget("aoi")}>AOI</button>
                    <button className={`border px-2 py-1 rounded ${editTarget === "av" ? "bg-slate-800 text-white" : "bg-white"}`} onClick={() => setEditTarget("av")}>Área Verde</button>
                    <button className={`border px-2 py-1 rounded ${editTarget === "corte" ? "bg-slate-800 text-white" : "bg-white"}`} onClick={() => setEditTarget("corte")}>Corte</button>
                    <button className={`border px-2 py-1 rounded ${editTarget === "loteavel" ? "bg-slate-800 text-white" : "bg-white"}`} onClick={() => setEditTarget("loteavel")}>Loteável</button>
                    <button className={`border px-2 py-1 rounded ${editTarget === "rua_mask" ? "bg-slate-800 text-white" : "bg-white"}`} onClick={() => setEditTarget("rua_mask")}>Máscara Rua</button>
                    {/* Guia */}
                    <button className={`border px-2 py-1 rounded ${editTarget === "guia" ? "bg-amber-500 text-white" : "bg-white"}`} onClick={() => setEditTarget("guia")} title="Editar linha-guia">Guia</button>
                    <button className="border px-2 py-1 rounded bg-amber-100 hover:bg-amber-200" onClick={startGuideDraw} title="Desenhar nova linha-guia">➕ Desenhar guia</button>
                </div>

                {/* Medição */}
                <div className="flex gap-1 ml-2">
                    <span className="text-xs mr-1 opacity-70">Medir:</span>
                    <button
                        className={`border px-2 py-1 rounded ${measureMode === "distance" ? "bg-slate-800 text-white" : "bg-white"}`}
                        onClick={() => setMeasureMode(m => m === "distance" ? "none" : "distance")}
                        title="Medição de distância (linha)"
                    >
                        Distância
                    </button>
                    <button
                        className={`border px-2 py-1 rounded ${measureMode === "area" ? "bg-slate-800 text-white" : "bg-white"}`}
                        onClick={() => setMeasureMode(m => m === "area" ? "none" : "area")}
                        title="Medição de área (polígono)"
                    >
                        Área
                    </button>
                </div>
            </div>

            {/* Painel parcelamento */}
            <div className="absolute z-[1000] bottom-10 right-2 bg-white/90 backdrop-blur rounded-xl shadow p-3 w-[360px]">
                <h3 className="font-semibold mb-2">Parcelamento</h3>
                <ParcelamentoPanel
                    map={mapRef.current}
                    planoId={planoId}
                    alFeature={geo?.area_loteavel?.features?.[0] || (geo?.aoi && { type: "Feature", geometry: geo?.aoi, properties: {} })}
                    onPreview={(data) => {
                        const L = layersRef.current;
                        setLayerData(L.prev_vias, toFC(data?.vias), styleViaPreview);
                        setLayerData(L.prev_quarteiroes, toFC(data?.quarteiroes), styleQuartPreview);
                        setLayerData(L.prev_lotes, toFC(data?.lotes), styleLotePreview);
                    }}
                    onMaterialize={async (versaoId) => {
                        const gj = await getVersaoGeojson(versaoId);
                        setParcelOficial({ vias: gj?.vias || null, quarteiroes: gj?.quarteiroes || null, lotes: gj?.lotes || null });
                        const L = layersRef.current;
                        setLayerData(L.prev_vias, { type: "FeatureCollection", features: [] }, styleViaPreview);
                        setLayerData(L.prev_quarteiroes, { type: "FeatureCollection", features: [] }, styleQuartPreview);
                        setLayerData(L.prev_lotes, { type: "FeatureCollection", features: [] }, styleLotePreview);
                    }}
                    // passa ruas/guia para o backend (respeito de distância/orientação)
                    extraParams={extraParams}
                />
                <div className="text-[11px] text-gray-600 mt-2">
                    Edite com Select/Modify/Translate (nativos OL). <kbd>Shift</kbd> arrasta; <kbd>Shift+clique</kbd> remove; <kbd>Alt+clique</kbd> adiciona.<br />
                    Use <b>Guia</b> ou <b>➕ Desenhar guia</b> para orientar os lotes quando não houver ruas próximas.
                </div>
            </div>

            {/* Mapa */}
            <div ref={containerRef} style={{ height: "100vh", width: "100%" }} />
        </div>
    );
}
