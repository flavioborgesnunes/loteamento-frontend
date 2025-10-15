// src/pages/restricoes/RestricoesViewerOL.jsx
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
import { Fill, Stroke, Style, Circle as CircleStyle } from "ol/style";
import GeoJSON from "ol/format/GeoJSON";
import { fromLonLat } from "ol/proj";
import Overlay from "ol/Overlay";
import { Modify, Snap, Select, Draw } from "ol/interaction";
import Translate from "ol/interaction/Translate";
import {
    click as clickSelectCondition,
    shiftKeyOnly,
    altKeyOnly,
} from "ol/events/condition";
import { defaults as defaultControls, ScaleLine, FullScreen, MousePosition, Zoom, Rotate, Attribution } from "ol/control";
import { createStringXY } from "ol/coordinate";
import { getLength as sphereLength, getArea as sphereArea } from "ol/sphere";
import { unByKey } from "ol/Observable";

// ---------------- Helpers (área e formatação) ----------------
const R = 6378137;
function lonLatToMercMeters([lon, lat]) {
    const x = (lon * Math.PI) / 180 * R;
    const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)) * R;
    return [x, y];
}
function ringAreaMeters2(ring) {
    let area = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = lonLatToMercMeters(ring[i]);
        const [xj, yj] = lonLatToMercMeters(ring[j]);
        area += (xj * yi - xi * yj);
    }
    return Math.abs(area) / 2;
}
function polygonAreaMeters2(coords) {
    if (!coords || !coords.length) return 0;
    let area = 0;
    coords.forEach((ring, idx) => {
        const a = ringAreaMeters2(ring);
        area += idx === 0 ? a : -a;
    });
    return Math.max(area, 0);
}
function multiPolygonAreaMeters2(mpoly) {
    if (!mpoly || !mpoly.length) return 0;
    return mpoly.reduce((s, p) => s + polygonAreaMeters2(p), 0);
}
function areaGeoJSONMeters2(geom) {
    if (!geom) return 0;
    if (geom.type === "Polygon") return polygonAreaMeters2(geom.coordinates);
    if (geom.type === "MultiPolygon") return multiPolygonAreaMeters2(geom.coordinates);
    return 0;
}
function fmtArea(m2) {
    if (!m2) return { m2: "0", ha: "0", label: "0 m²" };
    const ha = m2 / 10000;
    const m2s = m2.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
    const has = ha.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    return { m2: m2s, ha: has, label: `${m2s} m² (${has} ha)` };
}
function toFC(x) {
    if (!x) return { type: "FeatureCollection", features: [] };
    if (x.type === "FeatureCollection") return x;
    if (x.type === "Feature") return { type: "FeatureCollection", features: [x] };
    return { type: "FeatureCollection", features: [] };
}
function isNonEmptyFC(fc) {
    return fc?.type === "FeatureCollection" && Array.isArray(fc.features) && fc.features.length > 0;
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
        toFC(geo?.ferrovias_centerline), toFC(geo?.ferrovias_faixa)
    ];
    const all = { type: "FeatureCollection", features: [] };
    fcs.forEach(fc => { if (fc?.features?.length) all.features.push(...fc.features); });
    return { fcAOI, all: isNonEmptyFC(all) ? all : null };
}

// ---------------- Estilos ----------------
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
const styleLotePreview = new Style({ stroke: new Stroke({ color: "#0ea5e9", width: 1 }), fill: new Fill({ color: "rgba(14,165,233,0.14)" }) });

const styleViaOficial = new Style({ stroke: new Stroke({ color: "#7c3aed", width: 3 }) });
const styleQuartOficial = new Style({ stroke: new Stroke({ color: "#7c3aed", width: 2 }), fill: new Fill({ color: "rgba(124,58,237,0.10)" }) });
const styleLoteOficial = new Style({ stroke: new Stroke({ color: "#7c3aed", width: 1 }), fill: new Fill({ color: "rgba(124,58,237,0.14)" }) });

const gj = new GeoJSON();
function setLayerData(vectorLayer, dataFC, style) {
    if (!vectorLayer) return;
    const src = vectorLayer.getSource();
    src.clear(true);
    if (!dataFC) return;
    const fc = toFC(dataFC);
    if (fc.features?.length) {
        const feats = gj.readFeatures(fc, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" });
        src.addFeatures(feats);
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

const token = import.meta.env.VITE_MAPBOX_TOKEN?.trim();
const hidpi = typeof window !== "undefined" && window.devicePixelRatio > 1;

export default function RestricoesViewerOL() {
    const axiosAuth = useAxios();
    const { getOrCreatePlanoForProject, getVersaoGeojson } = useParcelamentoApi();

    const mapRef = useRef(null);
    const containerRef = useRef(null);
    const overlayRef = useRef(null);

    const baseLayersRef = useRef({});
    const layersRef = useRef({
        aoi: null, loteavel: null, av: null, corte: null,
        ruas_eixo: null, ruas_mask: null,
        rios_centerline: null, rios_faixa: null,
        lt_centerline: null, lt_faixa: null,
        ferrovias_centerline: null, ferrovias_faixa: null,
        prev_vias: null, prev_quarteiroes: null, prev_lotes: null,
        ofc_vias: null, ofc_quarteiroes: null, ofc_lotes: null,
    });

    const selectRef = useRef(null);
    const modifyRef = useRef(null);
    const translateRef = useRef(null);
    const snapRefs = useRef([]);

    const [projetos, setProjetos] = useState([]);
    const [projetoSel, setProjetoSel] = useState("");
    const [versoes, setVersoes] = useState([]);
    const [restricaoSel, setRestricaoSel] = useState("");
    const [geo, setGeo] = useState(null);

    const [planoId, setPlanoId] = useState(null);
    const [parcelPrev, setParcelPrev] = useState({ vias: null, quarteiroes: null, lotes: null });
    const [parcelOficial, setParcelOficial] = useState({ vias: null, quarteiroes: null, lotes: null });

    // === MODO DE EDIÇÃO (backend + prévia) ===
    // none | aoi | av | corte | loteavel | rua_mask
    const [editTarget, setEditTarget] = useState("none");

    // === Medição ===
    const drawMeasureRef = useRef(null);
    const measureHelpTooltipRef = useRef(null);
    const measureMeasureTooltipRef = useRef(null);
    const measureHelpElRef = useRef(null);
    const measureMeasureElRef = useRef(null);
    const [measureMode, setMeasureMode] = useState("none"); // "none" | "distance" | "area"

    const loteavelFC = useMemo(() => {
        const fc = geo?.area_loteavel;
        if (!fc) return { type: "FeatureCollection", features: [] };
        return fc.type === "FeatureCollection" ? fc : { type: "FeatureCollection", features: [] };
    }, [geo]);

    const aoiGeom = useMemo(() => geo?.aoi || geo?.aoi_snapshot || null, [geo]);
    const aoiAreaM2 = useMemo(() => areaGeoJSONMeters2(aoiGeom), [aoiGeom]);
    const loteavelAreaM2 = useMemo(() => {
        const feats = loteavelFC?.features || [];
        if (!feats.length) return 0;
        return feats.reduce((acc, f) => {
            const propA = Number(f?.properties?.area_m2);
            const a = Number.isFinite(propA) && propA > 0 ? propA : areaGeoJSONMeters2(f?.geometry);
            return acc + (Number.isFinite(a) ? a : 0);
        }, 0);
    }, [loteavelFC]);
    const aoiFmt = useMemo(() => fmtArea(aoiAreaM2), [aoiAreaM2]);
    const lotFmt = useMemo(() => fmtArea(loteavelAreaM2), [loteavelAreaM2]);

    const [baseSel, setBaseSel] = useState(token ? "mapbox-hibrido" : "esri");

    // ---------------- Medição: helpers ----------------
    function formatLength(geom) {
        const len = sphereLength(geom, { projection: "EPSG:3857" });
        if (len > 1000) return `${(len / 1000).toFixed(2)} km`;
        return `${len.toFixed(2)} m`;
    }
    function formatArea(geom) {
        const area = sphereArea(geom, { projection: "EPSG:3857" });
        if (area > 1e6) return `${(area / 1e6).toFixed(2)} km²`;
        if (area > 1e4) return `${(area / 1e4).toFixed(2)} ha`;
        return `${area.toFixed(2)} m²`;
    }
    function createHelpTooltip() {
        if (!mapRef.current) return;
        if (measureHelpElRef.current) measureHelpElRef.current.remove();
        const helpEl = document.createElement("div");
        helpEl.style.cssText = "position:absolute;background:rgba(255,255,255,0.95);color:#111;padding:4px 8px;border-radius:4px;border:1px solid rgba(0,0,0,0.2);white-space:nowrap;font-size:12px;pointer-events:none;";
        measureHelpElRef.current = helpEl;
        const overlay = new Overlay({ element: helpEl, offset: [15, 0], positioning: "center-left" });
        measureHelpTooltipRef.current = overlay;
        mapRef.current.addOverlay(overlay);
    }
    function createMeasureTooltip() {
        if (!mapRef.current) return;
        if (measureMeasureElRef.current) measureMeasureElRef.current.remove();
        const measureEl = document.createElement("div");
        measureEl.style.cssText = "position:absolute;background:rgba(0,0,0,0.7);color:#fff;padding:4px 8px;border-radius:4px;white-space:nowrap;font-size:12px;pointer-events:none;";
        measureMeasureElRef.current = measureEl;
        const overlay = new Overlay({ element: measureEl, offset: [0, -15], positioning: "bottom-center" });
        measureMeasureTooltipRef.current = overlay;
        mapRef.current.addOverlay(overlay);
    }
    function disposeMeasure() {
        if (!mapRef.current) return;
        if (drawMeasureRef.current) {
            try { if (drawMeasureRef.current.__cleanup) drawMeasureRef.current.__cleanup(); } catch { }
            mapRef.current.removeInteraction(drawMeasureRef.current);
            drawMeasureRef.current = null;
        }
        if (measureHelpTooltipRef.current) { mapRef.current.removeOverlay(measureHelpTooltipRef.current); measureHelpTooltipRef.current = null; }
        if (measureMeasureTooltipRef.current) { mapRef.current.removeOverlay(measureMeasureTooltipRef.current); measureMeasureTooltipRef.current = null; }
        if (measureHelpElRef.current) { measureHelpElRef.current.remove(); measureHelpElRef.current = null; }
        if (measureMeasureElRef.current) { measureMeasureElRef.current.remove(); measureMeasureElRef.current = null; }
    }
    function enableMeasure(kind /* "distance" | "area" */) {
        if (!mapRef.current) return;
        // pausa interações de edição para evitar conflito
        if (selectRef.current) mapRef.current.removeInteraction(selectRef.current);
        if (modifyRef.current) mapRef.current.removeInteraction(modifyRef.current);
        if (translateRef.current) mapRef.current.removeInteraction(translateRef.current);
        snapRefs.current.forEach((s) => mapRef.current.removeInteraction(s));
        snapRefs.current = [];

        disposeMeasure();
        createHelpTooltip();
        createMeasureTooltip();

        const type = kind === "area" ? "Polygon" : "LineString";
        const draw = new Draw({
            source: new VectorSource(), // geometria temporária
            type,
            style: new Style({
                stroke: new Stroke({ color: "#111", width: 2 }),
                fill: new Fill({ color: "rgba(14,165,233,0.1)" }),
                image: new CircleStyle({ radius: 4, fill: new Fill({ color: "#0ea5e9" }) })
            }),
        });

        let listener;
        draw.on("drawstart", (evt) => {
            const sketch = evt.feature;
            listener = sketch.getGeometry().on("change", (e) => {
                const geom = e.target;
                const output = (type === "Polygon") ? formatArea(geom) : formatLength(geom);
                if (measureMeasureElRef.current && measureMeasureTooltipRef.current) {
                    measureMeasureElRef.current.innerHTML = output;
                    measureMeasureTooltipRef.current.setPosition(geom.getLastCoordinate());
                }
            });
        });

        draw.on("drawend", () => {
            if (listener) unByKey(listener);
            setMeasureMode("none"); // sai do modo após concluir
        });

        const pointerMove = (evt) => {
            if (!measureHelpElRef.current || !measureHelpTooltipRef.current) return;
            if (evt.dragging) return;
            const msg = (type === "Polygon")
                ? "Clique para desenhar. Clique no primeiro ponto para fechar."
                : "Clique para iniciar; duplo-clique para finalizar.";
            measureHelpElRef.current.innerHTML = msg;
            measureHelpTooltipRef.current.setPosition(evt.coordinate);
        };
        mapRef.current.on("pointermove", pointerMove);

        drawMeasureRef.current = draw;
        draw.__cleanup = () => { mapRef.current && mapRef.current.un("pointermove", pointerMove); };
        mapRef.current.addInteraction(draw);
    }
    function disableMeasure() {
        disposeMeasure();
        // reativa interações normais conforme modo atual
        mapRef.current?.__recreateInteractions?.(editTarget || "none");
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
            source: new XYZ({ url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" })
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
        L.prev_lotes = mkVec(612, styleLotePreview);
        L.ofc_vias = mkVec(613, styleViaOficial);
        L.ofc_quarteiroes = mkVec(614, styleQuartOficial);
        L.ofc_lotes = mkVec(615, styleLoteOficial);

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

        overlayRef.current = new Overlay({
            element: document.createElement("div"),
            autoPan: { animation: { duration: 200 } },
            offset: [0, -12],
            positioning: "bottom-center",
        });
        mapRef.current.addOverlay(overlayRef.current);

        // --- Interações: recriáveis por "modo de edição" ---
        const buildLayerFilter = (mode) => {
            const Lx = layersRef.current;
            const allowPreview = (lyr) => lyr === Lx.prev_vias || lyr === Lx.prev_quarteiroes || lyr === Lx.prev_lotes;
            if (mode === "none") return allowPreview;
            if (mode === "aoi") return (lyr) => allowPreview(lyr) || lyr === Lx.aoi;
            if (mode === "av") return (lyr) => allowPreview(lyr) || lyr === Lx.av;
            if (mode === "corte") return (lyr) => allowPreview(lyr) || lyr === Lx.corte;
            if (mode === "loteavel") return (lyr) => allowPreview(lyr) || lyr === Lx.loteavel;
            if (mode === "rua_mask") return (lyr) => allowPreview(lyr) || lyr === Lx.ruas_mask;
            return allowPreview;
        };

        const recreateInteractions = (mode) => {
            // limpa anteriores
            if (selectRef.current) mapRef.current.removeInteraction(selectRef.current);
            if (modifyRef.current) mapRef.current.removeInteraction(modifyRef.current);
            if (translateRef.current) mapRef.current.removeInteraction(translateRef.current);
            snapRefs.current.forEach((s) => mapRef.current.removeInteraction(s));
            snapRefs.current = [];

            // SELECT
            selectRef.current = new Select({
                condition: clickSelectCondition,
                hitTolerance: 10,
                multi: true,
                layers: buildLayerFilter(mode),
            });
            mapRef.current.addInteraction(selectRef.current);

            // MODIFY
            modifyRef.current = new Modify({
                features: selectRef.current.getFeatures(),
                pixelTolerance: 10,
                style: new Style({
                    image: new CircleStyle({ radius: 6, fill: new Fill({ color: "#fff" }), stroke: new Stroke({ color: "#0ea5e9", width: 2 }) }),
                    stroke: new Stroke({ color: "#0ea5e9", width: 2 }),
                }),
                deleteCondition: (e) => shiftKeyOnly(e),   // Shift+clique remove vértice
                insertVertexCondition: (e) => altKeyOnly(e) // Alt+clique adiciona vértice
            });
            mapRef.current.addInteraction(modifyRef.current);

            // TRANSLATE (Shift para arrastar feição inteira)
            translateRef.current = new Translate({
                features: selectRef.current.getFeatures(),
                condition: shiftKeyOnly,
            });
            mapRef.current.addInteraction(translateRef.current);

            // SNAP em camadas relevantes
            const Lx = layersRef.current;
            [
                Lx.prev_vias, Lx.prev_quarteiroes, Lx.prev_lotes,
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

        // interações iniciais: somente PRÉVIA
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

        // expõe recriador
        mapRef.current.__recreateInteractions = recreateInteractions;

        return () => {
            window.removeEventListener("keydown", onKeyDownDelete);
            mapRef.current?.setTarget(null);
            mapRef.current = null;
        };
    }, []);

    // alterna base
    useEffect(() => {
        const bases = baseLayersRef.current;
        Object.entries(bases).forEach(([k, lyr]) => lyr.setVisible(k === baseSel));
    }, [baseSel]);

    // muda o modo de edição → recria interações
    useEffect(() => {
        if (!mapRef.current?.__recreateInteractions) return;
        mapRef.current.__recreateInteractions(editTarget);
    }, [editTarget]);

    // medição: liga/desliga conforme estado
    useEffect(() => {
        if (!mapRef.current) return;
        if (measureMode === "distance") enableMeasure("distance");
        else if (measureMode === "area") enableMeasure("area");
        else disableMeasure();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [measureMode]);

    // carrega projetos
    useEffect(() => {
        (async () => {
            try { const { data } = await axiosAuth.get("projetos/"); setProjetos(data || []); }
            catch (e) { console.error("[fetch projetos] erro:", e?.message || e); alert("Erro ao carregar projetos (faça login)."); }
        })();
    }, []);

    // seleção de projeto → versões + plano
    useEffect(() => {
        setVersoes([]); setRestricaoSel(""); setGeo(null); setPlanoId(null);
        setParcelPrev({ vias: null, quarteiroes: null, lotes: null });
        setParcelOficial({ vias: null, quarteiroes: null, lotes: null });
        if (!projetoSel) return;
        (async () => {
            try { const { data } = await axiosAuth.get(`/projetos/${projetoSel}/restricoes/list/`); setVersoes(data || []); }
            catch (e) { console.error("[listar versões] erro:", e?.message || e); alert("Erro ao listar versões."); }
            try { const plano = await getOrCreatePlanoForProject(projetoSel); setPlanoId(plano?.id || null); }
            catch (e) { console.error("[parcelamento] plano erro:", e?.message || e); }
        })();
    }, [projetoSel]);

    // abre versão escolhida
    useEffect(() => {
        setGeo(null);
        if (!restricaoSel) return;
        const ac = new AbortController();
        (async () => {
            try { const { data } = await axiosAuth.get(`/restricoes/${restricaoSel}/geo/`, { signal: ac.signal }); setGeo(data); }
            catch (e) {
                if (e?.name === "CanceledError" || e?.message === "canceled") return;
                console.error("[abrir versão] erro:", e?.message || e); alert("Não foi possível abrir a versão.");
            }
        })();
        return () => ac.abort();
    }, [restricaoSel]);

    // aplica camadas de contexto
    useEffect(() => {
        const L = layersRef.current;
        if (!mapRef.current) return;
        setLayerData(L.aoi, (geo?.aoi || geo?.aoi_snapshot) && { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: geo?.aoi || geo?.aoi_snapshot }] });
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
        setLayerData(L.loteavel, loteavelFC, styleLoteavel);

        // fit
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
    }, [geo, loteavelFC]);

    // PRÉVIA / OFICIAL
    function updatePreviewLayers(preview) {
        const L = layersRef.current;
        setLayerData(L.prev_vias, toFC(preview?.vias), styleViaPreview);
        setLayerData(L.prev_quarteiroes, toFC(preview?.quarteiroes), styleQuartPreview);
        setLayerData(L.prev_lotes, toFC(preview?.lotes), styleLotePreview);
    }
    const handlePreviewParcel = (preview) => {
        setParcelPrev({ vias: preview?.vias || null, quarteiroes: preview?.quarteiroes || null, lotes: preview?.lotes || null });
        updatePreviewLayers(preview);
    };
    const handleMaterializeParcel = async (versaoId) => {
        try {
            const gjOficial = await getVersaoGeojson(versaoId);
            setParcelOficial({ vias: gjOficial?.vias || null, quarteiroes: gjOficial?.quarteiroes || null, lotes: gjOficial?.lotes || null });
            const L = layersRef.current;
            setLayerData(L.prev_vias, { type: "FeatureCollection", features: [] }, styleViaPreview);
            setLayerData(L.prev_quarteiroes, { type: "FeatureCollection", features: [] }, styleQuartPreview);
            setLayerData(L.prev_lotes, { type: "FeatureCollection", features: [] }, styleLotePreview);
            setLayerData(L.ofc_vias, toFC(gjOficial?.vias), styleViaOficial);
            setLayerData(L.ofc_quarteiroes, toFC(gjOficial?.quarteiroes), styleQuartOficial);
            setLayerData(L.ofc_lotes, toFC(gjOficial?.lotes), styleLoteOficial);
        } catch (e) { console.error("[parcelamento] materializar erro:", e?.message || e); }
    };
    useEffect(() => {
        const L = layersRef.current;
        setLayerData(L.ofc_vias, toFC(parcelOficial.vias), styleViaOficial);
        setLayerData(L.ofc_quarteiroes, toFC(parcelOficial.quarteiroes), styleQuartOficial);
        setLayerData(L.ofc_lotes, toFC(parcelOficial.lotes), styleLoteOficial);
    }, [parcelOficial]);

    // ---------------- UI ----------------
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

                <select className="border p-2 rounded" value={baseSel} onChange={(e) => setBaseSel(e.target.value)} title="Mapa base">
                    {token && <option value="mapbox-hibrido">Mapbox Híbrido</option>}
                    {token && <option value="mapbox-ruas">Mapbox Ruas</option>}
                    {token && <option value="mapbox-sat">Mapbox Satélite</option>}
                    <option value="esri">Esri World Imagery</option>
                    <option value="osm">OSM (Ruas)</option>
                </select>

                {/* Modo de edição (controla camadas do backend editáveis) */}
                <div className="flex gap-1 ml-2">
                    <span className="text-xs mr-1 opacity-70">Editar:</span>
                    <button className={`border px-2 py-1 rounded ${editTarget === "none" ? "bg-slate-800 text-white" : "bg-white"}`} onClick={() => setEditTarget("none")} title="Somente PRÉVIA">Prévia</button>
                    <button className={`border px-2 py-1 rounded ${editTarget === "aoi" ? "bg-slate-800 text-white" : "bg-white"}`} onClick={() => setEditTarget("aoi")}>AOI</button>
                    <button className={`border px-2 py-1 rounded ${editTarget === "av" ? "bg-slate-800 text-white" : "bg-white"}`} onClick={() => setEditTarget("av")}>Área Verde</button>
                    <button className={`border px-2 py-1 rounded ${editTarget === "corte" ? "bg-slate-800 text-white" : "bg-white"}`} onClick={() => setEditTarget("corte")}>Corte</button>
                    <button className={`border px-2 py-1 rounded ${editTarget === "loteavel" ? "bg-slate-800 text-white" : "bg-white"}`} onClick={() => setEditTarget("loteavel")}>Loteável</button>
                    <button className={`border px-2 py-1 rounded ${editTarget === "rua_mask" ? "bg-slate-800 text-white" : "bg-white"}`} onClick={() => setEditTarget("rua_mask")}>Máscara Rua</button>
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
                    alFeature={loteavelFC?.features?.[0] || (aoiGeom && { type: "Feature", geometry: aoiGeom, properties: {} })}
                    onPreview={handlePreviewParcel}
                    onMaterialize={handleMaterializeParcel}
                />
                <div className="text-[11px] text-gray-600 mt-2">
                    Edite com os controles nativos: <b>Select/Modify/Translate</b>.<br />
                    <kbd>Shift</kbd> arrasta a feição inteira; <kbd>Shift+clique</kbd> remove vértice; <kbd>Alt+clique</kbd> adiciona vértice.<br />
                    Use os botões “Editar” para habilitar a camada do backend que deseja alterar.
                </div>
            </div>

            {/* Mapa */}
            <div ref={containerRef} style={{ height: "100vh", width: "100%" }} />
        </div>
    );
}
