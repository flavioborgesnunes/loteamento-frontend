// src/pages/geoman/components/useAreaVerde.js
import { useCallback, useEffect, useRef, useState } from "react";
import * as turf from "@turf/turf";
import {
    featureWithOriginal,
    ensureFeaturePolygon,
    layerToWgs84Feature,
    unionCortesMercator,
    differenceSafe,
} from "../geoUtils";

export default function useAreaVerde({ avLayerByUidRef, corteLayerByUidRef, fitToMap }) {
    const [areasVerdes, setAreasVerdes] = useState([]);
    const [cortes, setCortes] = useState([]);
    const [areaLoteavel, setAreaLoteavel] = useState(null);

    const [avAreaM2, setAvAreaM2] = useState(0);
    const [cortesAreaM2, setCortesAreaM2] = useState(0);
    const [cortePct, setCortePct] = useState(0);
    const [percentPermitido, setPercentPermitido] = useState(20);

    const seqRef = useRef({ av: 0, corte: 0, loteavel: 0 });
    const recalcRef = useRef(() => { });

    // --- recálculo leve (public) ---
    const recomputePreview = useCallback(() => {
        try {
            let somaAV = 0;
            let algumAvVivo = false;
            avLayerByUidRef.current.forEach((layer) => {
                const live = layerToWgs84Feature(layer, "av-live");
                if (live) {
                    somaAV += turf.area(ensureFeaturePolygon(live, "av-live"));
                    algumAvVivo = true;
                }
            });
            if (!algumAvVivo) {
                somaAV = areasVerdes.reduce((acc, av) => acc + turf.area(ensureFeaturePolygon(av, "av-state")), 0);
            }

            let somaCortes = 0;
            let algumCorteVivo = false;
            corteLayerByUidRef.current.forEach((layer) => {
                const live = layerToWgs84Feature(layer, "corte-live");
                if (live) {
                    somaCortes += turf.area(ensureFeaturePolygon(live, "corte-live"));
                    algumCorteVivo = true;
                }
            });
            if (!algumCorteVivo) {
                somaCortes = cortes.reduce((acc, c) => acc + turf.area(ensureFeaturePolygon(c, "corte-state")), 0);
            }

            const pct = somaAV > 0 ? (somaCortes / somaAV) * 100 : 0;
            setAvAreaM2(somaAV);
            setCortesAreaM2(somaCortes);
            setCortePct(pct);
        } catch { }
    }, [areasVerdes, cortes, avLayerByUidRef, corteLayerByUidRef]);

    useEffect(() => { recalcRef.current = () => recomputePreview(); }, [recomputePreview]);

    // --- sync layer->state ao final da edição ---
    const syncLayerToState = useCallback((kind, uid, layer) => {
        try {
            const liveFeat = layerToWgs84Feature(layer, `${kind}-live`);
            if (!liveFeat) return;
            const updated = featureWithOriginal(liveFeat, "live");
            updated.properties = { ...(updated.properties || {}), _uid: uid };
            if (kind === "av") {
                setAreasVerdes(prev => prev.map(it => (it?.properties?._uid === uid ? updated : it)));
            } else if (kind === "corte") {
                setCortes(prev => prev.map(it => (it?.properties?._uid === uid ? updated : it)));
            }
        } catch { }
    }, []);

    // --- criar AV / Corte a partir de GeoJSON (pm:create) ---
    const addAreaVerdeFromGJ = useCallback((gj) => {
        const f = featureWithOriginal({ type: "Feature", geometry: gj.geometry }, "leaflet");
        f.properties = f.properties || {};
        f.properties._uid = ++seqRef.current.av;
        setAreasVerdes(prev => [...prev, f]);
        fitToMap?.(f);
        recalcRef.current?.();
    }, [fitToMap]);

    const addCorteFromGJ = useCallback((gj) => {
        const f = featureWithOriginal({ type: "Feature", geometry: gj.geometry }, "leaflet");
        f.properties = f.properties || {};
        f.properties._uid = ++seqRef.current.corte;
        setCortes(prev => [...prev, f]);
        fitToMap?.(f);
        recalcRef.current?.();
    }, [fitToMap]);

    const limparCortes = useCallback(() => {
        setCortes([]);
        corteLayerByUidRef.current = new Map();
        setCortesAreaM2(0);
        setCortePct(0);
        recalcRef.current?.();
    }, [corteLayerByUidRef]);

    // --- gerar área loteável ---
    const gerarAreaLoteavel = useCallback(() => {
        if (!areasVerdes.length) { alert("Desenhe ao menos uma Área Verde antes de gerar."); return; }
        try {
            const avListWgs = areasVerdes.map((av) => {
                const uid = av?.properties?._uid;
                const layer = avLayerByUidRef.current.get(uid);
                const gj = layer?.toGeoJSON?.();
                const feat = gj
                    ? (gj.type === "Feature" ? gj : (gj.type === "FeatureCollection" && gj.features?.[0]) ? gj.features[0] : null)
                    : av;
                return feat;
            }).filter(Boolean);

            const cortesListWgs = cortes.map((c) => {
                const uid = c?.properties?._uid;
                const layer = corteLayerByUidRef.current.get(uid);
                const gj = layer?.toGeoJSON?.();
                const feat = gj
                    ? (gj.type === "Feature" ? gj : (gj.type === "FeatureCollection" && gj.features?.[0]) ? gj.features[0] : null)
                    : c;
                return feat;
            }).filter(Boolean);

            const baseArea = avListWgs.reduce((acc, f) => acc + turf.area(ensureFeaturePolygon(f, "av-WGS84")), 0);
            const avListM = avListWgs.map((f) => turf.toMercator(ensureFeaturePolygon(f, "av")));
            const cortesUnionM = cortesListWgs.length ? unionCortesMercator(cortesListWgs) : null;

            let loteavelM = null;
            for (const avM of avListM) {
                const diff = differenceSafe(avM, cortesUnionM);
                if (!diff) continue;
                loteavelM = !loteavelM ? diff : (turf.union(loteavelM, diff) || loteavelM);
            }
            if (!loteavelM) {
                const removed = baseArea;
                const perc = baseArea > 0 ? (removed / baseArea) * 100 : 0;
                const limite = parseFloat(percentPermitido) || 0;
                if (perc > limite + 1e-6) {
                    alert(`Cortes excedem o limite (${limite.toFixed(1)}%). Tentou remover ${removed.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m² (${perc.toFixed(2)}%).`);
                    return;
                }
                setAreaLoteavel(null);
                return;
            }

            const loteavelW = turf.toWgs84(loteavelM);
            const newArea = turf.area(ensureFeaturePolygon(loteavelW, "diff-WGS84"));
            const removed = Math.max(0, baseArea - newArea);
            const perc = baseArea > 0 ? (removed / baseArea) * 100 : 0;

            const limite = parseFloat(percentPermitido) || 0;
            if (perc > limite + 1e-6) {
                alert(`Cortes excedem o limite (${limite.toFixed(1)}%). Tentou remover ${removed.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m² (${perc.toFixed(2)}%).`);
                return;
            }

            const next = featureWithOriginal(loteavelW, "difference");
            next.properties._uid = ++seqRef.current.loteavel;
            setAreaLoteavel(next);
        } catch (err) {
            console.error("[gerarAreaLoteavel] erro", err);
            alert("Falha ao gerar a área loteável. Veja o console para detalhes.");
        }
    }, [areasVerdes, cortes, avLayerByUidRef, corteLayerByUidRef, percentPermitido]);

    return {
        // estado
        areasVerdes, setAreasVerdes,
        cortes, setCortes,
        areaLoteavel, setAreaLoteavel,

        avAreaM2, cortesAreaM2, cortePct,
        percentPermitido, setPercentPermitido,

        // ações
        addAreaVerdeFromGJ,
        addCorteFromGJ,
        limparCortes,
        gerarAreaLoteavel,

        // edição/sync e recálculo
        syncLayerToState,
        recomputePreview,
        recalcRef,
        seqRef,
    };
}
